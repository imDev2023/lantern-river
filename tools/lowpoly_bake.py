"""Cut a heavy model (a Tripo output, a Poly Haven scan) down to a phone budget and bake its detail.

    blender -b --factory-startup --python-exit-code 1 -P tools/lowpoly_bake.py -- \
        in.glb out.glb --tris 8000 --size 1024 [--margin 4] [--color-pass emit|diffuse]

1. Import the model, apply its transforms and join every mesh into one high-poly object.
2. Copy it, decimate the copy to --tris triangles and unwrap it afresh, so models with
   several materials and overlapping UVs (common in generated and scanned models) bake cleanly.
3. Bake from the high object onto the low one, selected to active with a small cage:
   - base colour as EMIT, by wiring each material's Base Color into an emission shader.
     A DIFFUSE colour bake reads metal as black, since metal has no diffuse colour
     (from Kensei's article, sources/2026-11-07-kensei-opus-blender-unity.md in x-gaming);
     --color-pass diffuse exists only to show that;
   - a tangent-space normal map, which carries the high mesh's shape and its own normal maps;
   - roughness and metallic packed glTF-style (G = roughness, B = metallic), also as EMIT.
4. Export the low object alone as GLB with all three maps, and print the counts as JSON.

Blender 4.3 or newer. Never touches the input file.
"""

import json
import os
import sys
import time

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    raise SystemExit("usage: lowpoly_bake.py -- in.glb out.glb [--tris N] [--size PX] [--margin PX] [--color-pass emit|diffuse]")
src, dst = os.path.abspath(argv[0]), os.path.abspath(argv[1])
opts = {"--tris": "8000", "--size": "1024", "--margin": "4", "--color-pass": "emit"}
for i in range(2, len(argv) - 1, 2):
    if argv[i] not in opts:
        raise SystemExit(f"unknown option {argv[i]}")
    opts[argv[i]] = argv[i + 1]
target_tris, size, margin = int(opts["--tris"]), int(opts["--size"]), int(opts["--margin"])
color_pass = opts["--color-pass"]
if color_pass not in ("emit", "diffuse"):
    raise SystemExit("--color-pass is emit or diffuse")
started = time.time()


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# 1. A clean scene with only the imported model.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no meshes in " + src)
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
high = bpy.context.view_layer.objects.active
high.name = "High"
for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
    bpy.data.objects.remove(o)
high_tris = tri_count(high)
dims = list(high.dimensions)

# 2. The low copy: decimate, then a fresh unwrap with room for the bake margin.
low = high.copy()
low.data = high.data.copy()
low.name = "Low"
bpy.context.scene.collection.objects.link(low)
if high_tris > target_tris:
    dec = low.modifiers.new("Decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = target_tris / high_tris
    dec.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier=dec.name)
low.data.materials.clear()
while low.data.uv_layers:
    low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name="UVMap")
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=margin / size * 2)
bpy.ops.uv.pack_islands(margin=margin / size)
bpy.ops.object.mode_set(mode="OBJECT")
low_tris = tri_count(low)


# 3. Bake targets and the low object's final material.
def new_image(name, non_color):
    img = bpy.data.images.new(name, size, size, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


images = {
    "color": new_image("Lantern_Color", False),
    "normal": new_image("Lantern_Normal", True),
    "orm": new_image("Lantern_ORM", True),
}
mat = bpy.data.materials.new("Baked")
mat.use_nodes = True
mat.use_backface_culling = True  # closed meshes export single-sided (WORKFLOW.md done checks)
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tex = {}
for key, img in images.items():
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    tex[key] = t
nt.links.new(tex["color"].outputs["Color"], bsdf.inputs["Base Color"])
nmap = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(tex["normal"].outputs["Color"], nmap.inputs["Color"])
nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(tex["orm"].outputs["Color"], sep.inputs["Color"])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
low.data.materials.append(mat)


def make_active_target(key):
    for n in nt.nodes:
        n.select = False
    tex[key].select = True
    nt.nodes.active = tex[key]


# Each high material gets an emission shader whose colour we rewire per pass.
originals = {}
for m in high.data.materials:
    if m is None or not m.use_nodes:
        continue
    mnt = m.node_tree
    out = next((n for n in mnt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
    p = next((n for n in mnt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if out is None or p is None:
        continue
    surface_link = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
    emit = mnt.nodes.new("ShaderNodeEmission")
    combine = mnt.nodes.new("ShaderNodeCombineColor")
    originals[m.name] = (mnt, out, p, surface_link, emit, combine)


def feed(mnt, socket, into):
    """Connect whatever drives the colour `socket` into `into`, or copy its constant colour."""
    if socket.links:
        mnt.links.new(socket.links[0].from_socket, into)
    else:
        into.default_value = tuple(socket.default_value)


def wire_emission(kind):
    for mnt, out, p, _, emit, combine in originals.values():
        for l in list(emit.inputs["Color"].links):
            mnt.links.remove(l)
        if kind == "color":
            feed(mnt, p.inputs["Base Color"], emit.inputs["Color"])
        else:
            combine.inputs["Red"].default_value = 1.0
            for ch, name in (("Green", "Roughness"), ("Blue", "Metallic")):
                for l in list(combine.inputs[ch].links):
                    mnt.links.remove(l)
                s = p.inputs[name]
                if s.links:
                    mnt.links.new(s.links[0].from_socket, combine.inputs[ch])
                else:
                    combine.inputs[ch].default_value = s.default_value
            mnt.links.new(combine.outputs["Color"], emit.inputs["Color"])
        mnt.links.new(emit.outputs["Emission"], out.inputs["Surface"])


def restore_surfaces():
    for mnt, out, _, surface_link, _, _ in originals.values():
        if surface_link is not None:
            mnt.links.new(surface_link, out.inputs["Surface"])


scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
bake = scene.render.bake
bake.use_selected_to_active = True
bake.use_cage = True
bake.cage_extrusion = 0.02 * max(dims)
bake.max_ray_distance = 0.05 * max(dims)
bake.margin = margin
bpy.ops.object.select_all(action="DESELECT")
high.select_set(True)
low.select_set(True)
bpy.context.view_layer.objects.active = low

# Base colour.
make_active_target("color")
if color_pass == "emit":
    wire_emission("color")
    scene.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT")
else:
    restore_surfaces()
    scene.cycles.samples = 1
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE")

# Roughness and metallic.
make_active_target("orm")
wire_emission("orm")
bpy.ops.object.bake(type="EMIT")

# Normals, through the original shaders so their normal maps count.
restore_surfaces()
make_active_target("normal")
scene.cycles.samples = 4
bake.normal_space = "TANGENT"
bpy.ops.object.bake(type="NORMAL")


def mean_rgb(img):
    px = list(img.pixels)
    n = len(px) // 4
    return [round(sum(px[c::4]) / n, 4) for c in range(3)]


# 4. Export the low object alone, with its images packed into the GLB.
for img in images.values():
    img.pack()
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=90)
print("LOWPOLY_BAKE " + json.dumps({
    "in": os.path.basename(src),
    "out": os.path.basename(dst),
    "high_tris": high_tris,
    "low_tris": low_tris,
    "size_m": [round(d, 3) for d in dims],
    "texture_px": size,
    "color_pass": color_pass,
    "color_mean_rgb": mean_rgb(images["color"]),
    "glb_kb": round(os.path.getsize(dst) / 1024),
    "seconds": round(time.time() - started, 1),
}))
