"""
Empire Streets: Blender batch polish for Streetmon .glb models.

    blender --background --python scripts/blender/batch_update.py -- \
        --input-dir "public/creatures" --output-dir "build/blender-polished"

For every .glb in --input-dir (same file name in --output-dir):
  1. Resets to an empty scene and imports the file (rig, weights, clips, COLOR_0 kept).
  2. Mesh polish:
       - applies object rotation and scale on meshes (scale -> 1, 1, 1);
       - removes duplicate vertices (per bone, so parts on different bones are never welded)
         and loose vertices/edges, keeping UV maps and colour layers;
       - recalculates face normals outside, smooths by angle (40 degrees);
       - adds a BEVEL modifier (0.02 m, 2 segments, angle limit 30 degrees, Harden Normals)
         and a WEIGHTED_NORMAL modifier, with the Armature modifier kept last.
  3. Materials (by material name and the species' types from the manifest):
       - metallic (gun / metal / chrome / steel): Metallic 0.85, Roughness 0.25;
       - matte (concrete / ground / stone): Metallic 0.0, Roughness 0.85;
       - emissive accents (eyes / lights / cores / glow): Emission Strength 3.5;
       - clearcoat 0.15 on vehicles and glossy surfaces.
  4. Exports .glb (apply modifiers except the armature, +Y up, all animations, vertex colours,
     extras so the game's emissive pulse survives; the armature object's own node is dropped so
     the skinned meshes sit at the scene root and the Khronos validator has nothing to warn
     about), then re-reads input and output to compare:
     triangles, clips, joints, colour attributes, triangle budget.
  5. Writes batch_log.txt and batch_log.json to --output-dir. Exit code 1 if any file failed.

Options (after the "--"):
  --input-dir DIR         folder of .glb files (required)
  --output-dir DIR        destination (required; must differ from the input folder)
  --manifest FILE         species manifest for type-based materials
                          (default: <input-dir>/manifest.json if present)
  --pattern GLOB          files to process (default: *.glb)
  --bevel-offset M        bevel width in metres (default 0.02)
  --bevel-segments N      bevel segments (default 2)
  --bevel-angle DEG       bevel angle limit (default 30)
  --smooth-angle DEG      smooth-by-angle threshold (default 40)
  --emission-strength X   emissive strength (default 3.5)
  --clearcoat X           clearcoat weight for glossy surfaces (default 0.15)
  --tri-budget N          triangles per model before a warning (default 1500; 0 = off)
  --fit-budget            if over budget: retry with 1 bevel segment, then without the bevel
  --merge-distance M      weld distance for duplicate vertices (default 0.00001)

Tested with Blender 5.2.3 LTS; export options are matched to the running Blender version
(options this version doesn't have are reported in the log, not passed).
"""

import argparse
import fnmatch
import json
import logging
import math
import os
import struct
import sys
import time
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

# ----------------------------------------------------------------------------- arguments


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="batch_update.py", description="Blender batch polish for .glb models")
    p.add_argument("--input-dir", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--manifest", default=None)
    p.add_argument("--pattern", default="*.glb")
    p.add_argument("--bevel-offset", type=float, default=0.02)
    p.add_argument("--bevel-segments", type=int, default=2)
    p.add_argument("--bevel-angle", type=float, default=30.0)
    p.add_argument("--smooth-angle", type=float, default=40.0)
    p.add_argument("--emission-strength", type=float, default=3.5)
    p.add_argument("--clearcoat", type=float, default=0.15)
    p.add_argument("--tri-budget", type=int, default=1500)
    p.add_argument("--fit-budget", action="store_true")
    p.add_argument("--merge-distance", type=float, default=1e-5)
    a = p.parse_args(argv)
    a.input_dir = os.path.abspath(os.path.expanduser(a.input_dir))
    a.output_dir = os.path.abspath(os.path.expanduser(a.output_dir))
    if not os.path.isdir(a.input_dir):
        p.error(f"--input-dir {a.input_dir} is not a folder")
    if os.path.realpath(a.input_dir) == os.path.realpath(a.output_dir):
        p.error("--output-dir must differ from --input-dir (originals are never overwritten)")
    if a.manifest is None:
        cand = os.path.join(a.input_dir, "manifest.json")
        a.manifest = cand if os.path.isfile(cand) else None
    return a


# ----------------------------------------------------------------------------- glb inspection (no Blender)


def read_glb(path):
    """Summary of a .glb straight from its JSON chunk: triangles, clips, joints, colours, extensions."""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("not a glTF 2.0 binary")
    clen, ctype = struct.unpack_from("<II", data, 12)
    j = json.loads(data[20:20 + clen].decode("utf-8").rstrip(" \0"))
    acc = j.get("accessors", [])
    tris = 0
    colors = 0
    prims = 0
    for m in j.get("meshes", []):
        for pr in m.get("primitives", []):
            prims += 1
            if pr.get("mode", 4) != 4:
                continue
            n = acc[pr["indices"]]["count"] if "indices" in pr else acc[pr["attributes"]["POSITION"]]["count"]
            tris += n // 3
            if "COLOR_0" in pr["attributes"]:
                colors += 1
    nodes = j.get("nodes", [])
    joint_ids = sorted({i for s in j.get("skins", []) for i in s["joints"]})
    joints = sorted(nodes[i].get("name", str(i)) for i in joint_ids)
    # Joints whose rest scale isn't 1 (e.g. the collapsed evolve aura): must survive the round trip.
    rest_scales = {
        nodes[i].get("name", str(i)): [round(v, 4) for v in nodes[i]["scale"]]
        for i in joint_ids
        if "scale" in nodes[i] and any(abs(v - 1) > 1e-4 for v in nodes[i]["scale"])
    }
    return {
        "bytes": len(data),
        "triangles": tris,
        "primitives": prims,
        "primitives_with_color": colors,
        "clips": sorted(a.get("name", "") for a in j.get("animations", [])),
        "joints": joints,
        "rest_scales": rest_scales,
        "skins": len(j.get("skins", [])),
        "materials": [m.get("name", "") for m in j.get("materials", [])],
        "extensions": sorted(j.get("extensionsUsed", [])),
        "generator": j.get("asset", {}).get("generator", ""),
    }


# ----------------------------------------------------------------------------- scene


class LogCapture(logging.Handler):
    """Collects warnings the glTF importer/exporter log (they use Python logging)."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.messages = []

    def emit(self, record):
        self.messages.append(record.getMessage()[:300])


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Make sure the glTF add-on is on (factory settings normally enable it).
    if not hasattr(bpy.ops.import_scene, "gltf"):
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")


def op_kwargs(op, wanted, log):
    """Keeps only the options this Blender's operator has (names change between versions)."""
    props = {p.identifier for p in op.get_rna_type().properties}
    out = {}
    for k, v in wanted.items():
        if k in props:
            out[k] = v
        else:
            log.append(f"export option '{k}' not available in Blender {bpy.app.version_string}; skipped")
    return out


# ----------------------------------------------------------------------------- mesh polish


def apply_rot_scale(obj):
    """Bakes rotation and scale into the mesh (location and parenting kept)."""
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    loc, rot, scale = obj.matrix_basis.decompose()
    m = Matrix.LocRotScale(Vector((0, 0, 0)), rot, scale)
    if m == Matrix.Identity(4):
        return False
    obj.data.transform(m)
    obj.matrix_basis = Matrix.LocRotScale(loc, None, None)
    obj.data.update()
    return True


def colors_to_corner(me):
    """Moves colour layers to face-corner domain so welding vertices can't blur colour seams."""
    for attr in list(me.color_attributes):
        if attr.domain == "CORNER":
            continue
        name, dtype, active = attr.name, attr.data_type, me.color_attributes.active_color_name == attr.name
        values = [tuple(c.color) for c in attr.data] if dtype in ("FLOAT_COLOR", "BYTE_COLOR") else None
        corner = me.color_attributes.new(name + "__corner", dtype, "CORNER")
        for li, loop in enumerate(me.loops):
            corner.data[li].color = values[loop.vertex_index]
        me.color_attributes.remove(me.color_attributes[name])
        corner = me.color_attributes[name + "__corner"]
        corner.name = name
        if active:
            me.color_attributes.active_color = me.color_attributes[name]
    if len(me.color_attributes) and me.color_attributes.render_color_index < 0:
        me.color_attributes.render_color_index = 0


def clean_geometry(obj, merge_distance):
    """Welds duplicates per bone (dominant vertex group) and removes loose verts/edges."""
    me = obj.data
    colors_to_corner(me)
    bm = bmesh.new()
    bm.from_mesh(me)
    before = len(bm.verts)
    deform = bm.verts.layers.deform.active
    groups = {}
    for v in bm.verts:
        key = -1
        if deform is not None and v[deform]:
            key = max(v[deform].items(), key=lambda kv: kv[1])[0]
        groups.setdefault(key, []).append(v)
    for verts in groups.values():
        bmesh.ops.remove_doubles(bm, verts=verts, dist=merge_distance)
    loose_edges = [e for e in bm.edges if not e.link_faces]
    if loose_edges:
        bmesh.ops.delete(bm, geom=loose_edges, context="EDGES")
    loose_verts = [v for v in bm.verts if not v.link_edges]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    after = len(bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return before, after


def smooth_by_angle(obj, angle_deg):
    me = obj.data
    for poly in me.polygons:
        poly.use_smooth = True
    if hasattr(me, "set_sharp_from_angle"):  # Blender 4.1+
        me.set_sharp_from_angle(angle=math.radians(angle_deg))
    else:  # older: mesh auto smooth
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(angle_deg)
    me.update()


def add_polish_modifiers(obj, args, segments):
    for m in [m for m in obj.modifiers if m.name in ("Polish Bevel", "Polish Weighted Normal")]:
        obj.modifiers.remove(m)
    if segments > 0:
        bev = obj.modifiers.new("Polish Bevel", "BEVEL")
        bev.width = args.bevel_offset
        bev.segments = segments
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(args.bevel_angle)
        bev.harden_normals = True
        bev.use_clamp_overlap = True
    wn = obj.modifiers.new("Polish Weighted Normal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    wn.mode = "FACE_AREA"
    # The armature deforms last, after the polish.
    for m in [m for m in obj.modifiers if m.type == "ARMATURE"]:
        idx = list(obj.modifiers).index(m)
        obj.modifiers.move(idx, len(obj.modifiers) - 1)


def evaluated_triangles(meshes, skip_armature=True):
    """Triangles after modifiers (armature switched off, as the exporter does)."""
    saved = []
    for o in meshes:
        for m in o.modifiers:
            if skip_armature and m.type == "ARMATURE":
                saved.append((m, m.show_viewport))
                m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    n = 0
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        ev.to_mesh_clear()
    for m, v in saved:
        m.show_viewport = v
    return n


# ----------------------------------------------------------------------------- animation


def action_fcurves(act):
    """All F-curves of an action (layered actions in Blender 4.4+, plain ones before)."""
    curves = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    if not curves and hasattr(act, "fcurves"):
        curves.extend(act.fcurves)
    return curves


def key_rest_scales(arm, rest_scales):
    """
    Gives every clip a constant key for each joint whose rest scale isn't 1 (the collapsed evolve
    aura). The exporter resets pose bones to identity before sampling each clip, so a clip that
    doesn't animate such a joint would otherwise export it at scale 1 (aura shell visible).
    Returns how many clips were keyed.
    """
    if not rest_scales:
        return 0
    actions = set()
    if arm.animation_data:
        if arm.animation_data.action:
            actions.add(arm.animation_data.action)
        for tr in arm.animation_data.nla_tracks:
            for st in tr.strips:
                if st.action:
                    actions.add(st.action)
    keyed = 0
    previous = arm.animation_data.action if arm.animation_data else None
    for act in sorted(actions, key=lambda a: a.name):
        # Blender 4.4+ adds F-curves only through an action assigned to the data-block.
        if arm.animation_data and hasattr(act, "fcurve_ensure_for_datablock"):
            arm.animation_data.action = act
        have = {(fc.data_path, fc.array_index) for fc in action_fcurves(act)}
        start, end = act.frame_range
        for bone, sc in rest_scales.items():
            if bone not in arm.pose.bones:
                continue
            path = f'pose.bones["{bone}"].scale'
            if any((path, i) in have for i in range(3)):
                continue  # the clip animates it already
            for i in range(3):
                if hasattr(act, "fcurve_ensure_for_datablock"):  # Blender 4.4+
                    fc = act.fcurve_ensure_for_datablock(arm, path, index=i, group_name=bone)
                else:
                    fc = act.fcurves.new(path, index=i, action_group=bone)
                fc.keyframe_points.insert(start, sc[i])
                if end > start:
                    fc.keyframe_points.insert(end, sc[i])
            keyed += 1
    if arm.animation_data:
        arm.animation_data.action = previous
    return keyed


# ----------------------------------------------------------------------------- materials

METAL_WORDS = ("gun", "metal", "chrome", "steel")
MATTE_WORDS = ("concrete", "ground", "stone")
EMISSIVE_WORDS = ("eye", "light", "core", "glow", "emiss", "neon", "line")
GLOSSY_WORDS = ("vehicle", "car", "gloss", "vinyl", "bass", "sludge")


def principled(mat):
    if not mat or not mat.node_tree:  # (Material.use_nodes is deprecated in Blender 5)
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def socket(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]
    return None


def is_emissive(mat, bsdf):
    name = mat.name.lower()
    strength = socket(bsdf, "Emission Strength")
    color = socket(bsdf, "Emission Color", "Emission")
    lit = False
    if color is not None and not color.is_linked:
        c = color.default_value
        lit = max(c[0], c[1], c[2]) > 0.0 and (strength is None or strength.default_value > 0)
    if color is not None and color.is_linked:
        lit = True
    return lit or any(w in name for w in EMISSIVE_WORDS)


def is_translucent(mat, bsdf):
    alpha = socket(bsdf, "Alpha")
    return (alpha is not None and (alpha.is_linked or alpha.default_value < 0.999)) or getattr(mat, "blend_method", "OPAQUE") == "BLEND"


def update_material(mat, types, args):
    """Applies the PBR rules; returns what changed."""
    bsdf = principled(mat)
    if bsdf is None:
        return "no Principled BSDF (left as is)"
    name = mat.name.lower()
    words = name + " " + " ".join(types)
    changes = []
    if is_emissive(mat, bsdf):
        s = socket(bsdf, "Emission Strength")
        if s is not None:
            s.default_value = args.emission_strength
            changes.append(f"emission {args.emission_strength}")
        # Keep the game's run-time pulse in step with the new base intensity.
        if "pulse" in mat.keys():
            pulse = mat["pulse"].to_dict() if hasattr(mat["pulse"], "to_dict") else dict(mat["pulse"])
            pulse["base"] = args.emission_strength
            mat["pulse"] = pulse
            changes.append("pulse base updated")
        return ", ".join(changes)
    if is_translucent(mat, bsdf):
        return "translucent (left as is)"
    metal = any(w in name for w in METAL_WORDS) or any(t in ("gun",) for t in types[:1])
    matte = any(w in name for w in MATTE_WORDS) or any(t in ("concrete",) for t in types[:1])
    if metal:
        socket(bsdf, "Metallic").default_value = 0.85
        socket(bsdf, "Roughness").default_value = 0.25
        changes.append("metallic 0.85 / rough 0.25")
    elif matte:
        socket(bsdf, "Metallic").default_value = 0.0
        socket(bsdf, "Roughness").default_value = 0.85
        changes.append("matte 0.0 / rough 0.85")
    rough = socket(bsdf, "Roughness").default_value
    glossy = any(w in words for w in GLOSSY_WORDS) or (not matte and rough <= 0.35 and not metal)
    if glossy:
        cc = socket(bsdf, "Coat Weight", "Clearcoat")
        if cc is not None:
            cc.default_value = args.clearcoat
            changes.append(f"clearcoat {args.clearcoat}")
    return ", ".join(changes) or "no rule matched (left as is)"


# ----------------------------------------------------------------------------- per file


def species_types(manifest, file_name):
    stem = os.path.splitext(file_name)[0]
    base = stem[:-6] if stem.endswith("_shiny") else stem
    entry = manifest.get(base)
    return list(entry.get("types", [])) if entry else []


def process(path, out_path, args, manifest):
    rec = {"file": os.path.basename(path), "warnings": [], "materials": {}, "status": "ok"}
    t0 = time.time()
    rec["input"] = read_glb(path)
    reset_scene()
    cap = LogCapture()
    logging.getLogger().addHandler(cap)
    try:
        res = bpy.ops.import_scene.gltf(filepath=path)
        if "FINISHED" not in res:
            raise RuntimeError(f"import failed: {res}")
        objs = list(bpy.context.scene.objects)
        arms = [o for o in objs if o.type == "ARMATURE"]
        shapes = {pb.custom_shape.name for a in arms for pb in a.pose.bones if pb.custom_shape}
        meshes = [o for o in objs if o.type == "MESH" and o.name not in shapes]
        # Bone display shapes the importer adds are not part of the model.
        for o in objs:
            if o.name in shapes:
                bpy.data.objects.remove(o, do_unlink=True)
        for a in arms:
            if any(abs(v - 1) > 1e-6 for v in a.scale) or a.rotation_mode != "QUATERNION" and any(abs(v) > 1e-6 for v in a.rotation_euler):
                rec["warnings"].append(f"armature '{a.name}' has rotation/scale; left unapplied to keep its animation intact")
            a.data.pose_position = "REST"
        rec["tris_before"] = evaluated_triangles(meshes)
        welded = 0
        applied = 0
        for o in meshes:
            applied += apply_rot_scale(o)
            b, a = clean_geometry(o, args.merge_distance)
            welded += b - a
            smooth_by_angle(o, args.smooth_angle)
        rec["transforms_applied"] = applied
        rec["vertices_welded"] = welded
        # Bevel, fitting the budget if asked.
        tries = [args.bevel_segments]
        if args.fit_budget:
            tries += [s for s in (1, 0) if s < args.bevel_segments]
        for seg in tries:
            for o in meshes:
                add_polish_modifiers(o, args, seg)
            rec["tris_after_estimate"] = evaluated_triangles(meshes)
            rec["bevel_segments"] = seg
            if not args.tri_budget or rec["tris_after_estimate"] <= args.tri_budget:
                break
        # Materials.
        types = species_types(manifest, rec["file"])
        rec["types"] = types
        for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
            rec["materials"][mat.name] = update_material(mat, types, args)
        # Pose = the input file's rest transforms (the exporter uses it as the joints' rest; see
        # export_rest_position_armature below): no clip applied, NLA off, every bone at its
        # rest location/rotation, with the joint rest scales glTF allows but Blender bones don't
        # hold (the collapsed evolve aura) put back from the input file.
        rest_scales = rec["input"]["rest_scales"]
        rec["clips_keyed_for_rest_scale"] = sum(key_rest_scales(a, rest_scales) for a in arms)
        for a in arms:
            a.data.pose_position = "POSE"
            if a.animation_data:
                a.animation_data.action = None
                a.animation_data.use_nla = False
            for pb in a.pose.bones:
                pb.location = (0.0, 0.0, 0.0)
                pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
                pb.rotation_euler = (0.0, 0.0, 0.0)
                pb.scale = rest_scales.get(pb.name, (1.0, 1.0, 1.0))
        bpy.context.view_layer.update()
        # The exporter wants each skinned mesh parented to its armature (the Streetmon files keep
        # them at the scene root, so the importer leaves them unparented). World transforms kept.
        for o in meshes:
            arm_mod = next((m for m in o.modifiers if m.type == "ARMATURE" and m.object), None)
            if arm_mod and o.parent is not arm_mod.object:
                mw = o.matrix_world.copy()
                o.parent = arm_mod.object
                o.matrix_world = mw
        # Export.
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        opts = op_kwargs(
            bpy.ops.export_scene.gltf,
            {
                "filepath": out_path,
                "export_format": "GLB",
                "export_apply": True,
                "export_yup": True,
                "export_animations": True,
                "export_animation_mode": "ACTIONS",
                "export_skins": True,
                "export_colors": True,  # Blender <= 4.1
                "export_vertex_color": "ACTIVE",  # Blender 4.2+
                "export_normals": True,
                "export_extras": True,
                "export_materials": "EXPORT",
                "export_def_bones": False,
                # Drop the armature object's own node (the rig has one root bone), so the skinned
                # meshes and the skeleton sit at the scene root as in the input files.
                "export_armature_object_remove": True,
                # Joints' rest = the imported pose with no clip applied, i.e. the input file's own
                # node transforms. Blender bones can't hold a rest *scale*, so with the armature's
                # rest position a joint like the evolve aura's (rest scale 0.001) would export at
                # scale 1 and the collapsed aura shell would show in every clip.
                "export_rest_position_armature": False,
                "use_selection": False,
            },
            [],
        )
        missing = sorted({"export_format", "export_apply", "export_yup", "export_animations"} - set(opts))
        if missing:
            rec["warnings"].append(f"export options missing in this Blender: {missing}")
        rec["export_options"] = sorted(k for k in opts if k != "filepath")
        res = bpy.ops.export_scene.gltf(**opts)
        if "FINISHED" not in res:
            raise RuntimeError(f"export failed: {res}")
        rec["output"] = read_glb(out_path)
    except Exception as e:  # keep going with the next file
        rec["status"] = "failed"
        rec["error"] = f"{type(e).__name__}: {e}"
        rec["trace"] = traceback.format_exc()[-1500:]
    finally:
        logging.getLogger().removeHandler(cap)
    rec["warnings"] += [f"[gltf] {m}" for m in cap.messages]
    if rec["status"] == "ok":
        i, o = rec["input"], rec["output"]
        rec["tris_delta"] = o["triangles"] - i["triangles"]
        if o["clips"] != i["clips"]:
            rec["warnings"].append(f"clips changed: {i['clips']} -> {o['clips']}")
        if o["joints"] != i["joints"]:
            rec["warnings"].append(f"joints changed: {len(i['joints'])} -> {len(o['joints'])}")
        if o.get("rest_scales") != i.get("rest_scales"):
            rec["warnings"].append(f"joint rest scales changed: {i.get('rest_scales')} -> {o.get('rest_scales')}")
        if o["skins"] < 1 and i["skins"] >= 1:
            rec["warnings"].append("skin lost on export")
        if i["primitives_with_color"] and o["primitives_with_color"] < o["primitives"]:
            rec["warnings"].append(f"COLOR_0 on {o['primitives_with_color']}/{o['primitives']} primitives (input had colours)")
        if args.tri_budget and o["triangles"] > args.tri_budget:
            rec["warnings"].append(f"{o['triangles']} triangles, over the {args.tri_budget} budget")
        if rec["warnings"]:
            rec["status"] = "warnings"
    rec["seconds"] = round(time.time() - t0, 2)
    return rec


# ----------------------------------------------------------------------------- main


def main():
    args = parse_args()
    manifest = {}
    if args.manifest:
        with open(args.manifest) as f:
            m = json.load(f)
        manifest = {c["id"]: c for c in m.get("creatures", [])}
    files = sorted(f for f in os.listdir(args.input_dir) if fnmatch.fnmatch(f, args.pattern) and f.lower().endswith(".glb"))
    os.makedirs(args.output_dir, exist_ok=True)
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        f"Blender batch polish — {started} — Blender {bpy.app.version_string}",
        f"input  {args.input_dir}",
        f"output {args.output_dir}",
        f"bevel {args.bevel_offset} m x {args.bevel_segments} seg @ {args.bevel_angle} deg (harden normals); smooth {args.smooth_angle} deg; "
        f"emission {args.emission_strength}; clearcoat {args.clearcoat}; budget {args.tri_budget or 'off'}{' (fit)' if args.fit_budget else ''}",
        f"manifest {args.manifest or 'none (material rules use names only)'}",
        "",
        f"  {'file':24} {'tris in':>7} {'tris out':>8} {'delta':>7} {'bevel':>5}  {'clips':>5} {'joints':>6}  status",
    ]
    print(lines[0], flush=True)
    records = []
    for f in files:
        rec = process(os.path.join(args.input_dir, f), os.path.join(args.output_dir, f), args, manifest)
        records.append(rec)
        if rec["status"] == "failed":
            line = f"✖ {f:24} FAILED: {rec['error']}"
        else:
            i, o = rec["input"], rec["output"]
            mark = "✔" if rec["status"] == "ok" else "!"
            line = (
                f"{mark} {f:24} {i['triangles']:7d} {o['triangles']:8d} {rec['tris_delta']:+7d} {rec['bevel_segments']:5d}  "
                f"{len(o['clips']):2d}/{len(i['clips']):<2d} {len(o['joints']):3d}/{len(i['joints']):<2d}  {rec['status']}"
            )
        lines.append(line)
        print(line, flush=True)
        for w in rec["warnings"]:
            lines.append(f"    - {w}")
    ok = [r for r in records if r["status"] != "failed"]
    over = [r for r in ok if args.tri_budget and r["output"]["triangles"] > args.tri_budget]
    lines += [
        "",
        f"{len(records)} files: {sum(r['status'] == 'ok' for r in records)} ok, "
        f"{sum(r['status'] == 'warnings' for r in records)} with warnings, {sum(r['status'] == 'failed' for r in records)} failed",
    ]
    if ok:
        tin = sum(r["input"]["triangles"] for r in ok)
        tout = sum(r["output"]["triangles"] for r in ok)
        lines.append(
            f"triangles: {tin} -> {tout} ({(tout - tin) / max(tin, 1) * 100:+.0f}%); per model {min(r['output']['triangles'] for r in ok)}-"
            f"{max(r['output']['triangles'] for r in ok)}; over budget: {len(over)}"
        )
    lines.append(f"warnings: {sum(len(r['warnings']) for r in records)}")
    for l in lines[-4:]:
        print(l, flush=True)
    with open(os.path.join(args.output_dir, "batch_log.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    with open(os.path.join(args.output_dir, "batch_log.json"), "w") as f:
        json.dump({"started": started, "blender": bpy.app.version_string, "args": vars(args), "files": records}, f, indent=2)
    sys.exit(1 if any(r["status"] == "failed" for r in records) else 0)


if __name__ == "__main__":
    main()
