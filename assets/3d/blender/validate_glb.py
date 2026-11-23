"""
Valida los GLB de CampusPulse 360 leyendo el chunk JSON (sin dependencias externas).

    python -I assets/3d/blender/validate_glb.py [ruta.glb ...]

Sin argumentos valida los tres GLB de apps/web/public/models/. Sale con codigo 1 si falta algo.
"""
import json
import os
import struct
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
MODELS = os.path.join(REPO, "apps", "web", "public", "models")
FLOORS = [f"FLOOR_P{i:02d}" for i in range(1, 11)]
SPC = {
    "SPC_1_LOBBY": 1, "SPC_1_BIB": 1, "SPC_2_A201": 2, "SPC_2_A202": 2, "SPC_3_A301": 3,
    "SPC_3_LAB1": 3, "SPC_4_A401": 4, "SPC_4_LAB2": 4, "SPC_5_OFI": 5, "SPC_5_AUD": 5,
}
BUILDING_NODES = ["BUILDING", "FACADE", "ROOF", "ATRIUM", "STAIRS", "ELEVATORS", "SENSOR_ANCHORS"] + FLOORS
BUILDING_MATS = [
    "GLASS_CURTAIN", "WHITE_PANEL", "FRAME_DARK", "GLASS_GROUND", "ROOF", "BRAND_RED", "SLAB",
    "CORE_BLACK", "STEEL", "TILE", "WOOD", "CEILING", "LIGHT_PANEL", "WINDOW_NIGHT",
    "SLAB_FACE", "STAIR_STRINGER", "STEEL_DOOR", "ELEV_INDICATOR", "PANEL_JOINT",   # v2
]


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack("<4sII", data[:12])
    clen, ctype = struct.unpack("<I4s", data[12:20])
    assert ctype == b"JSON", "el primer chunk no es JSON"
    return magic.decode("ascii"), version, length, len(data), json.loads(data[20:20 + clen])


def triangles(j):
    n = 0
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            if p.get("mode", 4) != 4:
                continue
            acc = j["accessors"][p["indices"]] if "indices" in p else j["accessors"][p["attributes"]["POSITION"]]
            n += acc["count"] // 3
    return n


def validate(path):
    magic, ver, hdr_len, real_len, j = read_glb(path)
    names = [n.get("name") for n in j["nodes"]]
    parent = {}
    for i, n in enumerate(j["nodes"]):
        for c in n.get("children", []):
            parent[c] = i
    by_name = {n.get("name"): i for i, n in enumerate(j["nodes"])}
    problems = []
    is_context = "utp-context" in os.path.basename(path)
    if magic != "glTF":
        problems.append(f"cabecera {magic!r}")
    if hdr_len != real_len:
        problems.append("longitud de cabecera distinta del archivo")
    if is_context:
        for need in ("CONTEXT",):
            if need not in by_name:
                problems.append(f"falta nodo {need}")
    else:
        for need in BUILDING_NODES:
            if need not in by_name:
                problems.append(f"falta nodo {need}")
        for sid, lvl in SPC.items():
            if sid not in by_name:
                problems.append(f"falta {sid}")
            else:
                par = j["nodes"][parent[by_name[sid]]]["name"] if by_name[sid] in parent else None
                if par != f"FLOOR_P{lvl:02d}":
                    problems.append(f"{sid} cuelga de {par}, se esperaba FLOOR_P{lvl:02d}")
            a = "ANCHOR_" + sid
            if a not in by_name:
                problems.append(f"falta {a}")
            else:
                par = j["nodes"][parent[by_name[a]]]["name"] if by_name[a] in parent else None
                if par != "SENSOR_ANCHORS":
                    problems.append(f"{a} cuelga de {par}")
        mats = {m["name"]: m for m in j.get("materials", [])}
        for mname in BUILDING_MATS:
            if mname in ("LIGHT_PANEL",) and "mobile" in os.path.basename(path):
                continue  # LOD1 no lleva luminarias individuales
            if mname not in mats:
                problems.append(f"falta material {mname}")
        for forbidden in ("EXT_meshopt_compression", "KHR_draco_mesh_compression"):
            if forbidden in j.get("extensionsUsed", []):
                problems.append(f"usa {forbidden}")
    mats = {m["name"]: m for m in j.get("materials", [])}
    glass_modes = {k: mats[k].get("alphaMode", "OPAQUE") for k in ("GLASS_CURTAIN", "GLASS_GROUND") if k in mats}
    prims = sum(len(m["primitives"]) for m in j.get("meshes", []))
    cameras_lights = ("cameras" in j) or ("KHR_lights_punctual" in j.get("extensionsUsed", []))
    if cameras_lights:
        problems.append("contiene camaras o luces")
    result = dict(
        file=os.path.basename(path), bytes=real_len, header=magic, version=ver, nodes=len(j["nodes"]),
        meshes=len(j.get("meshes", [])), primitives_drawcalls=prims, triangles=triangles(j),
        materials=len(mats), images=len(j.get("images", [])), extensionsUsed=j.get("extensionsUsed", []),
        glass_alphaMode=glass_modes, problems=problems,
    )
    if not is_context:
        result["floor_children"] = {
            n.get("name"): len(n.get("children", [])) for n in j["nodes"] if n.get("name") in FLOORS + ["FACADE", "ROOF", "ATRIUM", "STAIRS", "ELEVATORS"]
        }
        result["emissive_WINDOW_NIGHT"] = mats.get("WINDOW_NIGHT", {}).get("emissiveFactor")
    return result


if __name__ == "__main__":
    paths = sys.argv[1:] or [os.path.join(MODELS, f) for f in ("utp-huancayo.glb", "utp-huancayo-mobile.glb", "utp-context.glb")]
    bad = False
    for p in paths:
        r = validate(p)
        print(json.dumps(r, indent=1, ensure_ascii=False))
        bad = bad or bool(r["problems"])
    sys.exit(1 if bad else 0)
