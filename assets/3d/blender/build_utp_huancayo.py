"""
CampusPulse 360 - modelo arquitectonico ESTIMADO de la sede UTP Huancayo (Blender 5.x).

Script reproducible e idempotente: construye TODA la escena desde cero con bpy + bmesh,
guarda el .blend fuente, exporta los GLB y genera renders de validacion.

    "/c/Program Files/Blender Foundation/Blender 5.3/blender.exe" --background --factory-startup \
        --python assets/3d/blender/build_utp_huancayo.py -- [--skip-render] [--meshopt]

Salidas (rutas relativas a la raiz del repo):
  assets/3d/blender/utp-huancayo.blend                      fuente editable (LOD0)
  apps/web/public/models/utp-huancayo.glb                   LOD0 escritorio, solo BUILDING
  apps/web/public/models/utp-huancayo-mobile.glb            LOD1 movil, solo BUILDING
  apps/web/public/models/utp-context.glb                    CONTEXT (suelo, vereda, calle, valla, manzanas)
  docs/entregables/FINAL/capturas/blender/*.png             renders de validacion
  assets/3d/blender/build-report.json                       tamanos y triangulos MEDIDOS en esta corrida

IMPORTANTE (honestidad): NO hay planos ni levantamiento de la UTP Huancayo. Todas las dimensiones
son ESTIMACIONES tomadas de docs/referencias/especificacion-3d.md (a partir de una fotografia).
El modelo es una REPRESENTACION APROXIMADA, no una replica exacta. No se usa ningun recurso
descargado ni generador de IA: toda la geometria sale de cajas parametricas.

Convencion de ejes: el modelo se razona en coordenadas glTF (X derecha, Y arriba, Z hacia la
fachada principal). Blender usa Z arriba, por eso box() convierte (x, y, z) -> (x, -z, y):
la fachada principal queda hacia -Y de Blender y hacia +Z en el GLB (exportador con +Y up).
"""
import bpy
import bmesh
import json
import math
import os
import random
import sys
import zlib
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------- rutas / args
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLEND = os.path.join(HERE, "utp-huancayo.blend")
REPORT = os.path.join(HERE, "build-report.json")
MODELS = os.path.join(REPO, "apps", "web", "public", "models")
RENDERS = os.path.join(REPO, "docs", "entregables", "FINAL", "capturas", "blender")
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SKIP_RENDER = "--skip-render" in ARGV
USE_MESHOPT = "--meshopt" in ARGV
ONLY_RENDER = "--only-render" in ARGV

# --------------------------------------------------------------------------- dimensiones (ESTIMADAS)
# Mismos valores que apps/web/src/twin/constants.ts (DEFAULT_DIMS). Ninguno es una medicion real.
W, DP = 38.0, 30.0              # frente (X) y fondo (Z)
N = 10                          # niveles (dato del equipo)
H_GROUND, H_FLOOR, CROWN = 4.8, 3.6, 2.4
SLAB_T, WALL_T = 0.3, 0.6
HEADROOM, WALL_INSET, FRONT_SETBACK = 0.4, 0.8, 1.8
CORR = 2.4
ATR_W, ATR_D, ATR_X = 14.0, 9.0, 2.0
CORE_W, CORE_D = 7.0, 9.0
BAYS, PANES = 6, 4
PIER_L, EDGE_R = 4.0, 0.6
G_PIERS, PIER_S, G_SETBACK, SIGN_H = 7, 0.6, 1.5, 1.0
MARQ_W, MARQ_D, MARQ_T, MARQ_Y = 10.0, 4.0, 0.25, 3.5
ROOFBOX_W, ROOFBOX_D, ROOFBOX_H, ROOFBOX_X, ROOFBOX_Z = 14.0, 8.0, 3.0, -6.0, -6.0

ATR = dict(minX=ATR_X - ATR_W / 2, maxX=ATR_X + ATR_W / 2, minZ=-ATR_D / 2, maxZ=ATR_D / 2)
CORE = dict(minX=ATR["maxX"], maxX=ATR["maxX"] + CORE_W, minZ=-CORE_D / 2, maxZ=CORE_D / 2)
OUTER_Z = ATR_D / 2 + CORR
XR = (-W / 2 + WALL_INSET, W / 2 - WALL_INSET)
_INNER = OUTER_Z + 0.1
FRONT_Z = (_INNER, DP / 2 - FRONT_SETBACK)
BACK_Z = (-(DP / 2 - WALL_INSET), -_INNER)
# Escaleras (centro X, ancho, rango Z). ESTIMACION. La segunda va entre el nucleo y el muro este.
STAIRS = [
    dict(cx=-14.2, width=3.0, z0=-3.0, z1=3.0),
    dict(cx=(CORE["maxX"] + (W / 2 - WALL_INSET)) / 2, width=2.0, z0=-3.0, z1=3.0),
]
CWX0, CWX1 = -W / 2 + PIER_L, W / 2 - EDGE_R
CWW = CWX1 - CWX0
CWCX = (CWX0 + CWX1) / 2
COLS = BAYS * PANES
COLW = CWW / COLS
GLASS_Z = DP / 2 - 0.15


def base(k):
    return 0.0 if k == 0 else H_GROUND + (k - 1) * H_FLOOR


def height(k):
    return H_GROUND if k == 0 else H_FLOOR


ROOF_Y = base(N - 1) + height(N - 1)
TOP_Y = ROOF_Y + CROWN

# Espacios del seed (tabla 6 de la especificacion): (id, fila 0=frente +Z / 1=fondo -Z, etiqueta)
SPACES = [
    [("SPC_1_LOBBY", 0), ("SPC_1_BIB", 1)],
    [("SPC_2_A201", 0), ("SPC_2_A202", 1)],
    [("SPC_3_A301", 0), ("SPC_3_LAB1", 1)],
    [("SPC_4_A401", 0), ("SPC_4_LAB2", 1)],
    [("SPC_5_OFI", 0), ("SPC_5_AUD", 1)],
]
FURNISH = {"SPC_1_BIB": "library", "SPC_2_A202": "classroom", "SPC_3_LAB1": "lab", "SPC_4_LAB2": "lab", "SPC_5_AUD": "auditorium"}
BOOK_MATS = ["BOOKS_A", "BOOKS_B", "BOOKS_C"]

# --------------------------------------------------------------------------- materiales PBR
# nombre: (hex sRGB, roughness, metallic, alpha, emision hex | None)
MATERIAL_SPECS = {
    "GLASS_CURTAIN": ("#3A78C2", 0.04, 0.55, 0.93, None),
    "WHITE_PANEL": ("#E6E8EA", 0.6, 0.0, 1.0, None),
    "FRAME_DARK": ("#1A1F26", 0.4, 0.6, 1.0, None),
    "GLASS_GROUND": ("#0E1724", 0.1, 0.3, 0.85, None),
    "GLASS_CLEAR": ("#8FD0DC", 0.05, 0.1, 0.4, None),
    "ROOF": ("#B9BEC4", 0.85, 0.0, 1.0, None),
    "BRAND_RED": ("#C8102E", 0.5, 0.0, 1.0, None),
    "SLAB": ("#8E97A4", 0.7, 0.1, 1.0, None),
    "CORE_BLACK": ("#0B0C0F", 0.12, 0.6, 1.0, None),
    "STEEL": ("#B7C0CC", 0.3, 0.9, 1.0, None),
    "TILE": ("#D9D2C5", 0.55, 0.0, 1.0, None),
    "WOOD": ("#C8955A", 0.55, 0.0, 1.0, None),
    "CEILING": ("#F2F2EF", 0.9, 0.0, 1.0, None),
    "LIGHT_PANEL": ("#FFF6E6", 0.5, 0.0, 1.0, "#FFF6E6"),
    "WINDOW_NIGHT": ("#FFF1E2", 0.5, 0.0, 1.0, "#FFF1E2"),
    "LED_CROWN": ("#FFFFFF", 0.5, 0.0, 1.0, "#FFFFFF"),
    "FURN_DARK": ("#15181E", 0.55, 0.1, 1.0, None),
    "SCREEN": ("#4A94EA", 0.3, 0.0, 1.0, None),
    "BOOKS_A": ("#C0392B", 0.8, 0.0, 1.0, None),
    "BOOKS_B": ("#2E86C1", 0.8, 0.0, 1.0, None),
    "BOOKS_C": ("#E9B824", 0.8, 0.0, 1.0, None),
    "SPC_VOLUME": ("#22D3D6", 0.5, 0.0, 0.25, None),
    # contexto
    "HEDGE": ("#2F5D34", 1.0, 0.0, 1.0, None),
    "ASPHALT": ("#2A2F38", 0.95, 0.0, 1.0, None),
    "GROUND": ("#6C7684", 0.95, 0.0, 1.0, None),
    "SIDEWALK": ("#A3ABB8", 0.9, 0.0, 1.0, None),
    "CONTEXT": ("#CFC0A8", 0.9, 0.0, 1.0, None),
    "CONTEXT_BRICK": ("#A9614B", 0.9, 0.0, 1.0, None),
    "CONTEXT_ROOF": ("#B9BEC4", 0.9, 0.0, 1.0, None),
    "LAMP_HEAD": ("#FFE9B8", 0.5, 0.0, 1.0, "#FFE9B8"),
}
EMISSIVE = ("LIGHT_PANEL", "WINDOW_NIGHT", "LED_CROWN", "LAMP_HEAD")

# --------------------------------------------------------------------------- estado global
FINE = True          # True = LOD0 (detalle fino); False = LOD1 movil
CLIP = None          # solo renders de seccion/aislamiento: recorte analitico de cajas (ver box())
WIN_SPLIT = False    # solo render nocturno: separa las ventanas por franja para variar la emision
ACC = {}             # (grupo, material, etiqueta) -> bmesh
MATS = {}
EMPTIES = {}
COLLS = {}
FLOOR_GROUPS = [f"FLOOR_P{k + 1:02d}" for k in range(N)]
BUILDING_GROUPS = ["FACADE", "ROOF", "ATRIUM", "STAIRS", "ELEVATORS"] + FLOOR_GROUPS + ["SENSOR_ANCHORS"]


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def gb(x, y, z):
    """glTF -> Blender."""
    return Vector((x, -z, y))


# --------------------------------------------------------------------------- escena base
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ACC.clear()
    MATS.clear()
    EMPTIES.clear()
    COLLS.clear()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.name = "UTP_Huancayo"


def make_materials():
    for name, (hexc, rough, metal, alpha, emis) in MATERIAL_SPECS.items():
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        lin = hex_lin(hexc)
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Alpha"].default_value = alpha
        m.diffuse_color = (*lin, alpha)
        m.roughness = rough
        m.metallic = metal
        if alpha < 1.0:
            for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
                try:
                    setattr(m, attr, val)
                except Exception:
                    pass
            try:
                m.use_backface_culling = False
            except Exception:
                pass
        if emis:
            bsdf.inputs["Emission Color"].default_value = (*hex_lin(emis), 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.0
        MATS[name] = m


def make_hierarchy():
    sc = bpy.context.scene

    def coll(name, parent):
        c = bpy.data.collections.new(name)
        parent.children.link(c)
        COLLS[name] = c
        return c

    b = coll("BUILDING", sc.collection)
    for g in BUILDING_GROUPS:
        coll(g, b)
    coll("CONTEXT", sc.collection)

    def empty(name, parent_obj, coll_name):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 1.0
        COLLS[coll_name].objects.link(e)
        if parent_obj:
            e.parent = parent_obj
        EMPTIES[name] = e
        return e

    root = empty("BUILDING", None, "BUILDING")
    for g in BUILDING_GROUPS:
        empty(g, root, g)
    empty("CONTEXT", None, "CONTEXT")


# --------------------------------------------------------------------------- primitivas
def box(group, mat, x, y, z, sx, sy, sz, rx=0.0, ry=0.0, fine=False, tag=None):
    """Caja en coordenadas glTF (centro x,y,z; tamano sx,sy,sz). Se fusiona por (grupo, material, etiqueta)."""
    if fine and not FINE:
        return
    if not FINE:
        tag = None
    if sx <= 0 or sy <= 0 or sz <= 0:
        return
    if CLIP is not None:
        if group in CLIP.get("skip", ()) or mat in CLIP.get("skip_mats", ()):
            return
        if "y" in CLIP and group in CLIP.get("y_groups", ()) and rx == 0 and ry == 0:
            lo, hi = max(y - sy / 2, CLIP["y"][0]), min(y + sy / 2, CLIP["y"][1])
            if hi <= lo:
                return
            y, sy = (lo + hi) / 2, hi - lo
        if "zmax" in CLIP:
            if rx == 0 and ry == 0:
                lo, hi = z - sz / 2, min(z + sz / 2, CLIP["zmax"])
                if hi <= lo:
                    return
                z, sz = (lo + hi) / 2, hi - lo
            elif z > CLIP["zmax"]:
                return
    key = (group, mat, tag)
    bm = ACC.get(key)
    if bm is None:
        bm = bmesh.new()
        ACC[key] = bm
    m = (
        Matrix.Translation((x, -z, y))
        @ Matrix.Rotation(ry, 4, "Z")
        @ Matrix.Rotation(rx, 4, "X")
        @ Matrix.Diagonal((sx, sz, sy, 1.0))
    )
    bmesh.ops.create_cube(bm, size=1.0, matrix=m, calc_uvs=False)


def flush():
    """Convierte los acumuladores en objetos Mesh (uno por grupo+material[+etiqueta])."""
    for (group, mat, tag), bm in ACC.items():
        name = f"{group}_{mat}" + (f"_{tag}" if tag else "")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(MATS[mat])
        ob = bpy.data.objects.new(name, me)
        COLLS[group if group in COLLS else "CONTEXT"].objects.link(ob)
        ob.parent = EMPTIES[group]
        if group in FLOOR_GROUPS:
            ob["level"] = FLOOR_GROUPS.index(group) + 1
        if tag and tag != "GEN":
            ob["space_code"] = tag
    ACC.clear()


def slab_cells(group, mat, yc, th, outer, holes):
    """Losa rectangular con huecos rectangulares (descomposicion en celdas, sin booleanos)."""
    x0, x1, z0, z1 = outer
    cl = lambda v, a, b: max(a, min(b, v))
    xs = sorted({x0, x1, *[cl(h[0], x0, x1) for h in holes], *[cl(h[1], x0, x1) for h in holes]})
    zs = sorted({z0, z1, *[cl(h[2], z0, z1) for h in holes], *[cl(h[3], z0, z1) for h in holes]})
    for zi in range(len(zs) - 1):
        za, zb = zs[zi], zs[zi + 1]
        zc = (za + zb) / 2
        segs = []
        for xi in range(len(xs) - 1):
            xa, xb = xs[xi], xs[xi + 1]
            xc = (xa + xb) / 2
            if any(h[0] < xc < h[1] and h[2] < zc < h[3] for h in holes):
                continue
            if segs and abs(segs[-1][1] - xa) < 1e-9:
                segs[-1][1] = xb
            else:
                segs.append([xa, xb])
        for a, b in segs:
            box(group, mat, (a + b) / 2, yc, zc, b - a, th, zb - za)


# --------------------------------------------------------------------------- FACADE (compartido)
def build_facade():
    g = "FACADE"
    h = ROOF_Y
    # Volumenes macizos continuos de todo el alto: lateral izquierdo CIEGO, posterior, derecho, pilastra y borde.
    box(g, "WHITE_PANEL", -W / 2 + WALL_T / 2, h / 2, -0.2, WALL_T, h, DP - 1.6)
    box(g, "WHITE_PANEL", 0, h / 2, -DP / 2 + WALL_T / 2, W, h, WALL_T)
    box(g, "WHITE_PANEL", W / 2 - WALL_T / 2, h / 2, 0.3, WALL_T, h, DP - 0.6)
    box(g, "WHITE_PANEL", -W / 2 + PIER_L / 2, h / 2, DP / 2 - 0.5, PIER_L, h, 1.0)


# --------------------------------------------------------------------------- pisos
def fl(k):
    return FLOOR_GROUPS[k]


def build_floor_slab(k):
    g = fl(k)
    b = base(k)
    sw, sd = W - 0.2, DP - 0.2
    yc = b + SLAB_T / 2
    if k == 0:
        box(g, "SLAB", 0, yc, 0, sw, SLAB_T, sd)
        return
    holes = [(ATR["minX"], ATR["maxX"], ATR["minZ"], ATR["maxZ"])]
    holes += [(s["cx"] - s["width"] / 2, s["cx"] + s["width"] / 2, s["z0"], s["z1"]) for s in STAIRS]
    slab_cells(g, "SLAB", yc, SLAB_T, (-sw / 2, sw / 2, -sd / 2, sd / 2), holes)
    # Frentes de losa del atrio (gris #8E97A4): vigas peraltadas bajo el borde del vacio.
    f = 0.12
    fy, fh = b, 0.6
    box(g, "SLAB", (ATR["minX"] + ATR["maxX"]) / 2, fy, ATR["maxZ"] + f / 2, ATR_W, fh, f, fine=True)
    box(g, "SLAB", (ATR["minX"] + ATR["maxX"]) / 2, fy, ATR["minZ"] - f / 2, ATR_W, fh, f, fine=True)
    box(g, "SLAB", ATR["minX"] - f / 2, fy, 0, f, fh, ATR_D + 2 * f, fine=True)


def build_curtain_and_generic(k):
    """Muro cortina (P2-P10), planta baja (P1) y bandas genericas posterior/derecha del piso k."""
    g = fl(k)
    b = base(k)
    H = height(k)
    yc = b + H / 2
    spaces = dict((row, sid) for sid, row in SPACES[k]) if k < 5 else {}
    front_tag = spaces[0].split("_", 2)[2] if 0 in spaces else "GEN"
    back_tag = spaces[1].split("_", 2)[2] if 1 in spaces else "GEN"
    if k == 0:
        glass_h = H - SIGN_H
        box(g, "GLASS_GROUND", CWCX, glass_h / 2, DP / 2 - G_SETBACK, CWW, glass_h, 0.1)
        box(g, "WHITE_PANEL", CWCX, H - SIGN_H / 2, DP / 2 - 0.25, CWW, SIGN_H, 0.5)
        box(g, "LED_CROWN", CWCX, H - SIGN_H / 2, DP / 2 + 0.02, CWW, 0.07, 0.03)
        span = CWW - PIER_S
        for i in range(G_PIERS):
            px = CWX0 + PIER_S / 2 + i * span / (G_PIERS - 1)
            box(g, "WHITE_PANEL", px, glass_h / 2, DP / 2 - PIER_S / 2, PIER_S, glass_h, PIER_S)
        mx, mw, mt, my = ATR_X, MARQ_W, MARQ_T, MARQ_Y
        front_z = DP / 2 + MARQ_D - 0.3
        box(g, "WHITE_PANEL", mx, my + mt / 2, DP / 2 + MARQ_D / 2 - 0.3, mw, mt, MARQ_D)
        box(g, "WHITE_PANEL", mx, my + mt / 2, front_z - 0.1, mw, 0.55, 0.2)
        for sgn in (-1, 1):
            box(g, "WHITE_PANEL", mx + sgn * (mw - 0.2) / 2, my + mt / 2, DP / 2 + MARQ_D / 2 - 0.3, 0.2, 0.55, MARQ_D)
            box(g, "WHITE_PANEL", mx + sgn * (mw / 2 - 0.45), my / 2, front_z - 0.55, 0.5, my, 0.5)
        box(g, "WHITE_PANEL", mx, my - 0.25, front_z - 0.55, mw - 0.9, 0.3, 0.35)
        box(g, "LED_CROWN", mx, my - 0.06, front_z - 0.3, mw - 0.6, 0.04, 0.06)
        # Puertas de vidrio del ingreso: 6 hojas con montantes, dintel, umbral y tiradores.
        n_leaf, leaf = 6, 1.0
        dz = DP / 2 - G_SETBACK + 0.07
        dx0 = mx - n_leaf * leaf / 2
        for i in range(n_leaf + 1):
            box(g, "FRAME_DARK", dx0 + i * leaf, 1.225, dz, 0.07, 2.45, 0.08)
        box(g, "FRAME_DARK", mx, 2.45, dz, n_leaf * leaf + 0.07, 0.1, 0.1)
        box(g, "FRAME_DARK", mx, 0.04, dz, n_leaf * leaf + 0.07, 0.08, 0.1)
        for i in range(n_leaf):
            box(g, "GLASS_CLEAR", dx0 + (i + 0.5) * leaf, 1.23, dz - 0.01, leaf - 0.08, 2.36, 0.02)
        for p in (1, 3, 5):
            for sgn in (-1, 1):
                box(g, "STEEL", dx0 + p * leaf + sgn * 0.12, 1.05, dz + 0.06, 0.03, 0.3, 0.03, fine=True)
        # Escalon de ingreso (el piso interior esta 0,30 m sobre el lote).
        box(g, "SLAB", mx, 0.075, DP / 2 + 0.7, mw - 1, 0.15, 1.6)
        box(g, "SLAB", mx, 0.04, DP / 2 + 1.75, mw + 1, 0.08, 0.6)
        for i in range(12):
            box(g, "WINDOW_NIGHT", CWX0 + (i + 0.5) * CWW / 12, 1.9, DP / 2 - G_SETBACK + 0.075,
                CWW / 12 - 0.4, 2.8, 0.01, tag=front_tag)
    else:
        # Muro cortina: vidrio continuo por piso, junta de losa, montantes principales y secundarios.
        box(g, "GLASS_CURTAIN", CWCX, yc, GLASS_Z, CWW, H - 0.1, 0.08)
        box(g, "FRAME_DARK", CWCX, b + 0.05, GLASS_Z + 0.03, CWW, 0.1, 0.25)
        for bay in range(BAYS + 1):
            box(g, "FRAME_DARK", CWX0 + bay * CWW / BAYS, yc, GLASS_Z + 0.05, 0.25, H, 0.35)
        for c in range(1, COLS):
            if c % PANES == 0:
                continue
            if not FINE and c % PANES != 2:
                continue  # LOD1: solo el montante secundario central de cada franja
            box(g, "FRAME_DARK", CWX0 + c * COLW, yc, GLASS_Z + 0.03, 0.08, H, 0.15)
        # Ventanas encendidas: MISMA geometria con emision (el visor modula la intensidad).
        for c in range(COLS):
            x = CWX0 + (c + 0.5) * COLW
            box(g, "WINDOW_NIGHT", x, b + SLAB_T + (H - SLAB_T) / 2, GLASS_Z + 0.045,
                COLW - 0.12, H - SLAB_T - 0.45, 0.01, tag=f"{front_tag}{c // PANES}" if WIN_SPLIT else front_tag)
    # Bandas de ventanas GENERICAS (fachadas posterior y derecha, sin dato real).
    band_y = b + SLAB_T + 1.4
    box(g, "GLASS_GROUND", 0, band_y, -DP / 2 - 0.01, W - 6, 1.6, 0.08)
    box(g, "GLASS_GROUND", W / 2 + 0.01, band_y, 0, 0.08, 1.6, DP - 8)
    nb = 8
    for i in range(nb):
        bw = (W - 6) / nb
        box(g, "WINDOW_NIGHT", -(W - 6) / 2 + (i + 0.5) * bw, band_y, -DP / 2 - 0.06, bw - 0.3, 1.3, 0.01, tag=back_tag)
    nr = 6
    for i in range(nr):
        rw = (DP - 8) / nr
        box(g, "WINDOW_NIGHT", W / 2 + 0.06, band_y, -(DP - 8) / 2 + (i + 0.5) * rw, 0.01, 1.3, rw - 0.3, tag="GEN")


def build_corridors_ceilings(k):
    g = fl(k)
    b = base(k)
    H = height(k)
    tile_y = b + SLAB_T + 0.01
    ceil_y = b + H - HEADROOM
    tx0 = ATR["minX"] - CORR

    def ceiling(x0, x1, z0, z1):
        box(g, "CEILING", (x0 + x1) / 2, ceil_y + 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0)

    def light(x, z):
        box(g, "LIGHT_PANEL", x, ceil_y - 0.015, z, 0.6, 0.03, 0.6, fine=True)

    if k == 0:
        box(g, "TILE", (tx0 + ATR["maxX"]) / 2, tile_y, 0, ATR["maxX"] - tx0, 0.02, 2 * OUTER_Z)
    else:
        box(g, "TILE", (tx0 + ATR["maxX"]) / 2, tile_y, (ATR["maxZ"] + OUTER_Z) / 2, ATR["maxX"] - tx0, 0.02, OUTER_Z - ATR["maxZ"])
        box(g, "TILE", (tx0 + ATR["maxX"]) / 2, tile_y, -(ATR["maxZ"] + OUTER_Z) / 2, ATR["maxX"] - tx0, 0.02, OUTER_Z - ATR["maxZ"])
        box(g, "TILE", (tx0 + ATR["minX"]) / 2, tile_y, 0, ATR["minX"] - tx0, 0.02, ATR["maxZ"] - ATR["minZ"])
    for sgn in (1, -1):  # pasillo que rodea el nucleo por delante y por detras
        box(g, "TILE", (ATR["maxX"] + CORE["maxX"]) / 2, tile_y, sgn * (ATR["maxZ"] + OUTER_Z) / 2,
            CORE["maxX"] - ATR["maxX"], 0.02, OUTER_Z - ATR["maxZ"])
    # Falso cielo sobre los pasillos (el vacio del atrio queda abierto) y luminarias cuadradas.
    ceiling(tx0, CORE["maxX"], ATR["maxZ"], OUTER_Z)
    ceiling(tx0, CORE["maxX"], -OUTER_Z, ATR["minZ"])
    ceiling(tx0, ATR["minX"], ATR["minZ"], ATR["maxZ"])
    x = tx0 + 0.9
    while x < CORE["maxX"] - 0.3:
        light(x, (ATR["maxZ"] + OUTER_Z) / 2)
        light(x, -(ATR["maxZ"] + OUTER_Z) / 2)
        x += 3
    for z in (-3, 0, 3):
        light((tx0 + ATR["minX"]) / 2, z)


def build_rooms(k):
    """Ambientes de cada piso: piso, falso cielo, luminarias, tabique con puertas de madera y mobiliario (P1-P5)."""
    g = fl(k)
    b = base(k)
    H = height(k)
    y0 = b + SLAB_T
    ceil_y = b + H - HEADROOM
    rows = dict((row, sid) for sid, row in SPACES[k]) if k < 5 else {}
    for row in (0, 1):
        sid = rows.get(row)
        z0, z1 = FRONT_Z if row == 0 else BACK_Z
        x0, x1 = XR
        sx, sz = x1 - x0, z1 - z0
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        box(g, "TILE", cx, y0 + 0.01, cz, sx, 0.02, sz)
        box(g, "CEILING", cx, ceil_y + 0.02, cz, sx, 0.04, sz)
        nx = max(1, int(sx // 4))
        rows_z = [cz - sz / 4, cz + sz / 4] if row == 1 else [cz]
        for i in range(nx):
            for zz in rows_z:
                box(g, "LIGHT_PANEL", x0 + (i + 0.5) * sx / nx, ceil_y - 0.015, zz, 0.6, 0.03, 0.6, fine=True)
        # Tabique del lado del pasillo con puertas de madera; el fondo lleva antepecho + vidrio.
        wz = z0 - 0.05 if row == 0 else z1 + 0.05
        n_doors = max(1, round(sx / 7.5))
        door_w = 0.95
        wall_top = ceil_y - y0
        cursor = x0

        def part(xc, ln):
            if row == 1:
                box(g, "WHITE_PANEL", xc, y0 + 0.45, wz, ln, 0.9, 0.1)
                box(g, "GLASS_CLEAR", xc, y0 + 1.6, wz, ln, 1.4, 0.04)
            else:
                box(g, "WHITE_PANEL", xc, y0 + 1.15, wz, ln, 2.3, 0.1)

        for i in range(n_doors):
            xd = x0 + (i + 0.5) * sx / n_doors
            a = xd - door_w / 2
            if a - cursor > 0.05:
                part((cursor + a) / 2, a - cursor)
            box(g, "WOOD", xd, y0 + 1.1, wz, door_w, 2.2, 0.06)
            box(g, "STEEL", xd + 0.32, y0 + 1.0, wz + (0.045 if row == 1 else -0.045), 0.03, 0.14, 0.03, fine=True)
            cursor = xd + door_w / 2
        if x1 - cursor > 0.05:
            part((cursor + x1) / 2, x1 - cursor)
        box(g, "WHITE_PANEL", cx, y0 + 2.3 + (wall_top - 2.3) / 2, wz, sx, wall_top - 2.3, 0.1)
        kind = FURNISH.get(sid) if sid else None
        if kind and FINE:
            furnish(g, kind, row, cx, cz, sx, sz, y0)


def furnish(g, kind, row, sx_c, sz_c, sx, sz, y0):
    """Mobiliario representativo (solo LOD0, solo P1-P5)."""
    wall_z = sz_c - sz / 2 if row == 1 else sz_c + sz / 2
    d = 1 if row == 1 else -1
    fl_y = y0 + 0.02
    x0 = sx_c - sx / 2
    if kind in ("classroom", "lab"):
        nb = max(1, int(sx // 9))
        for i in range(nb):
            box(g, "CEILING", x0 + (i + 0.5) * sx / nb, fl_y + 1.6, wall_z + d * 0.04, 3.2, 1.2, 0.04)  # pizarras
    if kind == "classroom":
        cols = max(1, int((sx - 3) // 3) + 1)
        xs = sx_c - (cols - 1) * 3 / 2
        for r in range(4):
            z = wall_z + d * (1.9 + r * 1.25)
            for i in range(cols):
                x = xs + i * 3
                box(g, "FURN_DARK", x, fl_y + 0.45, z - d * 0.2, 2.3, 0.5, 0.03)
                box(g, "CEILING", x, fl_y + 0.75, z, 2.4, 0.04, 0.5)
    elif kind == "lab":
        segs = max(1, int((sx - 2) // 3.4))
        xs = sx_c - (segs - 1) * 3.4 / 2
        for r in range(2):
            z = wall_z + d * (2.6 + r * 3.0)
            for i in range(segs):
                x = xs + i * 3.4
                box(g, "CEILING", x, fl_y + 0.74, z, 2.9, 0.05, 0.8)
                box(g, "FURN_DARK", x, fl_y + 0.38, z - d * 0.34, 2.8, 0.72, 0.04)
                for dx in (-0.75, 0.75):
                    box(g, "FURN_DARK", x + dx, fl_y + 0.99, z - d * 0.1, 0.58, 0.36, 0.03)
                    box(g, "SCREEN", x + dx, fl_y + 0.99, z - d * 0.1 + d * 0.02, 0.52, 0.3, 0.012)
    elif kind == "library":
        units = max(1, int((sx - 2) // 2.7))
        xs = sx_c - (units - 1) * 2.7 / 2
        rnd = random.Random(1301)
        for r in range(3):
            z = wall_z + d * (1.8 + r * 2.2)
            for i in range(units):
                x = xs + i * 2.7
                box(g, "WOOD", x, fl_y + 1.0, z, 2.3, 2.0, 0.45)
                for bk in range(3):
                    box(g, rnd.choice(BOOK_MATS), x, fl_y + 0.5 + bk * 0.5, z + d * 0.255, 2.15, 0.28, 0.07)
    elif kind == "auditorium":
        # Auditorio esquematico: revestimiento de madera, escenario y gradas con butacas.
        box(g, "WOOD", sx_c, fl_y + 1.5, wall_z + d * 0.05, sx - 0.4, 3.0, 0.1)
        box(g, "WOOD", sx_c, fl_y + 0.2, wall_z + d * 1.6, 14.0, 0.4, 3.0)
        box(g, "CEILING", sx_c, fl_y + 1.9, wall_z + d * 0.12, 8.0, 2.6, 0.04)
        for r in range(7):
            z = wall_z + d * (5.2 + r * 0.95)
            rise = 0.14 * r
            box(g, "SLAB", sx_c, fl_y + rise / 2, z, sx - 4, max(0.02, rise), 0.95)
            for ci in range(4):
                xc = sx_c + (ci - 1.5) * 8.4
                box(g, "FURN_DARK", xc, fl_y + rise + 0.45, z, 7.4, 0.9, 0.5)


def build_core_doors(k):
    """Puertas de acero (3 ascensores, 2 hojas c/u) sobre el muro negro del nucleo, hacia el pasillo +Z."""
    g = fl(k)
    y0 = base(k) + SLAB_T
    pitch = CORE_W / 3
    for i in range(3):
        xc = CORE["minX"] + (i + 0.5) * pitch
        for dx in (-0.29, 0.29):
            box(g, "STEEL", xc + dx, y0 + 1.1, CORE["maxZ"] + 0.025, 0.56, 2.2, 0.05)
        box(g, "LIGHT_PANEL", xc, y0 + 2.42, CORE["maxZ"] + 0.02, 0.32, 0.07, 0.03, fine=True)


def build_stairs(k):
    """2 escaleras en U (tramos, descanso, barandas inclinadas) que unen el piso k con el k+1."""
    if k >= N - 1:
        return
    g = fl(k)
    y0 = base(k) + SLAB_T
    H = height(k)
    half = H / 2
    steps = max(6, round(half / 0.19)) if FINE else 5
    riser = half / steps
    landing, gap = 1.6, 0.08
    for s in STAIRS:
        run_len = s["z1"] - s["z0"] - landing
        run = run_len / steps
        lane = (s["width"] - gap) / 2
        ca = s["cx"] - (lane + gap) / 2
        cb = s["cx"] + (lane + gap) / 2
        for j in range(1, steps + 1):
            h1 = j * riser
            box(g, "SLAB", ca, y0 + h1 / 2, s["z0"] + (j - 0.5) * run, lane, h1, run)
            h2 = half + j * riser
            box(g, "SLAB", cb, y0 + h2 / 2, s["z0"] + run_len - (j - 0.5) * run, lane, h2, run)
        box(g, "SLAB", s["cx"], y0 + half - 0.1, s["z1"] - landing / 2, s["width"], 0.2, landing)
        ln = math.hypot(run_len, half)
        th = math.atan2(half, run_len)
        zm = s["z0"] + run_len / 2
        ry1 = y0 + 0.9 + half / 2
        ry2 = y0 + half + 0.9 + half / 2
        box(g, "STEEL", ca - lane / 2, ry1, zm, 0.04, 0.04, ln, rx=-th)
        box(g, "STEEL", ca + lane / 2, ry1, zm, 0.04, 0.04, ln, rx=-th)
        box(g, "STEEL", cb - lane / 2, ry2, zm, 0.04, 0.04, ln, rx=th)
        box(g, "STEEL", cb + lane / 2, ry2, zm, 0.04, 0.04, ln, rx=th)
        box(g, "STEEL", s["cx"], y0 + half + 0.9, s["z1"] - 0.04, s["width"], 0.04, 0.04)


def build_atrium_rails(k):
    """Barandas de tubos horizontales en los bordes del atrio (el borde este es el nucleo)."""
    if k == 0:
        return
    g = fl(k)
    y0 = base(k) + SLAB_T
    rw, rd, cx = ATR_W, ATR_D, ATR_X
    detailed = k < 5 and FINE
    rows = [0.35, 0.7, 1.05] if detailed else [0.55, 1.05]
    for dy in rows:
        box(g, "STEEL", cx, y0 + dy, ATR["maxZ"] - 0.06, rw, 0.045, 0.045)
        box(g, "STEEL", cx, y0 + dy, ATR["minZ"] + 0.06, rw, 0.045, 0.045)
        box(g, "STEEL", ATR["minX"] + 0.06, y0 + dy, 0, 0.045, 0.045, rd)
    if detailed:
        box(g, "STEEL", cx, y0 + 1.1, ATR["maxZ"] - 0.06, rw, 0.07, 0.07)
        box(g, "STEEL", cx, y0 + 1.1, ATR["minZ"] + 0.06, rw, 0.07, 0.07)
        box(g, "STEEL", ATR["minX"] + 0.06, y0 + 1.1, 0, 0.07, 0.07, rd)
    px_n = round(rw / (2 if detailed else 3.5))
    for i in range(px_n + 1):
        px = ATR["minX"] + 0.06 + i * (rw - 0.12) / px_n
        box(g, "STEEL", px, y0 + 0.525, ATR["maxZ"] - 0.06, 0.05, 1.05, 0.05)
        box(g, "STEEL", px, y0 + 0.525, ATR["minZ"] + 0.06, 0.05, 1.05, 0.05)
    pz = 4 if detailed else 2
    for i in range(1, pz):
        box(g, "STEEL", ATR["minX"] + 0.06, y0 + 0.525, ATR["minZ"] + i * rd / pz, 0.05, 1.05, 0.05)


# --------------------------------------------------------------------------- cubierta / compartidos
def build_roof():
    g = "ROOF"
    cy = ROOF_Y + CROWN / 2
    holes = [(ATR["minX"], ATR["maxX"], ATR["minZ"], ATR["maxZ"])]  # el atrio se cierra con la claraboya (ATRIUM)
    slab_cells(g, "ROOF", ROOF_Y + SLAB_T / 2, SLAB_T, (-(W - 0.2) / 2, (W - 0.2) / 2, -(DP - 0.2) / 2, (DP - 0.2) / 2), holes)
    box(g, "WHITE_PANEL", 0, cy, DP / 2 - WALL_T / 2, W, CROWN, WALL_T)
    box(g, "WHITE_PANEL", 0, cy, -DP / 2 + WALL_T / 2, W, CROWN, WALL_T)
    box(g, "WHITE_PANEL", -W / 2 + WALL_T / 2, cy, 0, WALL_T, CROWN, DP - 2 * WALL_T)
    box(g, "WHITE_PANEL", W / 2 - WALL_T / 2, cy, 0, WALL_T, CROWN, DP - 2 * WALL_T)
    # Acento rojo arriba a la derecha: panel liso, SIN letras ni logotipo.
    box(g, "BRAND_RED", W / 2 - EDGE_R - CROWN / 2 - 0.4, cy, DP / 2 + 0.03, CROWN, CROWN, 0.06)
    # Linea LED de la coronacion (frente y laterales); material emisivo aparte de las ventanas.
    box(g, "LED_CROWN", 0, ROOF_Y + 0.5, DP / 2 + 0.02, W - 1.0, 0.08, 0.04)
    box(g, "LED_CROWN", -W / 2 - 0.02, ROOF_Y + 0.5, 0, 0.04, 0.08, DP - 1.0)
    box(g, "LED_CROWN", W / 2 + 0.02, ROOF_Y + 0.5, 0, 0.04, 0.08, DP - 1.0)
    roof_top = ROOF_Y + SLAB_T
    box(g, "WHITE_PANEL", ROOFBOX_X, roof_top + ROOFBOX_H / 2, ROOFBOX_Z, ROOFBOX_W, ROOFBOX_H, ROOFBOX_D)
    # Equipos de cubierta: volumenes GENERICOS (sin dato real).
    box(g, "ROOF", 7, roof_top + 0.55, -7, 2.6, 1.1, 1.8)
    box(g, "ROOF", 12.5, roof_top + 0.4, -3, 1.8, 0.8, 1.4)
    box(g, "ROOF", -13, roof_top + 0.45, 6, 2.2, 0.9, 1.6)


def build_atrium_shared():
    g = "ATRIUM"
    # Pilares continuos en las esquinas del atrio (compartidos por todos los pisos).
    for sx in (ATR["minX"] - 0.2, ATR["maxX"] + 0.2):
        for sz in (ATR["minZ"] - 0.2, ATR["maxZ"] + 0.2):
            box(g, "SLAB", sx, ROOF_Y / 2 + SLAB_T / 2, sz, 0.4, ROOF_Y - SLAB_T, 0.4)
    # Claraboya del atrio: brocal metalico y vidrio claro.
    top = ROOF_Y + SLAB_T
    cx, cz = (ATR["minX"] + ATR["maxX"]) / 2, 0.0
    for sz in (ATR["minZ"], ATR["maxZ"]):
        box(g, "FRAME_DARK", cx, top + 0.4, sz, ATR_W + 0.3, 0.8, 0.15)
    for sx in (ATR["minX"], ATR["maxX"]):
        box(g, "FRAME_DARK", sx, top + 0.4, cz, 0.15, 0.8, ATR_D + 0.15)
    box(g, "GLASS_CLEAR", cx, top + 0.85, cz, ATR_W + 0.3, 0.05, ATR_D + 0.3)
    for i in range(1, 4):
        box(g, "FRAME_DARK", ATR["minX"] + i * ATR_W / 4, top + 0.86, cz, 0.08, 0.07, ATR_D + 0.3, fine=True)


def build_stairs_shared():
    g = "STAIRS"
    top = base(N - 1) + SLAB_T + 1.1
    for s in STAIRS:
        run_len = s["z1"] - s["z0"] - 1.6
        box(g, "WHITE_PANEL", s["cx"], (SLAB_T + top) / 2, s["z0"] + run_len / 2, 0.06, top - SLAB_T, run_len)


def build_elevators_shared():
    g = "ELEVATORS"
    cx = (CORE["minX"] + CORE["maxX"]) / 2
    box(g, "CORE_BLACK", cx, (SLAB_T + ROOF_Y) / 2, 0, CORE_W, ROOF_Y - SLAB_T, CORE_D)


# --------------------------------------------------------------------------- espacios y anclas
def build_spaces():
    sc = bpy.context.scene
    spc_mat = MATS["SPC_VOLUME"]
    for k in range(5):
        g = fl(k)
        b = base(k)
        space_h = height(k) - SLAB_T - HEADROOM
        for sid, row in SPACES[k]:
            z0, z1 = FRONT_Z if row == 0 else BACK_Z
            sx, sz = XR[1] - XR[0], z1 - z0
            cx, cz = (XR[0] + XR[1]) / 2, (z0 + z1) / 2
            cy = b + SLAB_T + space_h / 2
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((sx, sz, space_h, 1.0)), calc_uvs=False)
            me = bpy.data.meshes.new(sid)
            bm.to_mesh(me)
            bm.free()
            me.materials.append(spc_mat)
            ob = bpy.data.objects.new(sid, me)
            ob.location = gb(cx, cy, cz)
            COLLS[g].objects.link(ob)
            ob.parent = EMPTIES[g]
            ob["space_id"] = sid
            ob["level"] = k + 1
            ob.display_type = "WIRE"
            a = bpy.data.objects.new("ANCHOR_" + sid, None)
            a.empty_display_type = "SPHERE"
            a.empty_display_size = 0.4
            a.location = gb(cx, cy + space_h / 2, cz)
            COLLS["SENSOR_ANCHORS"].objects.link(a)
            a.parent = EMPTIES["SENSOR_ANCHORS"]
            a["space_id"] = sid
            a["level"] = k + 1


# --------------------------------------------------------------------------- CONTEXT
def build_context():
    g = "CONTEXT"
    lot = dict(minX=-34, maxX=34, minZ=-26, maxZ=22)
    box(g, "GROUND", 0, -0.25, 0, 700, 0.2, 700)
    box(g, "SIDEWALK", (lot["minX"] + lot["maxX"]) / 2, -0.1, (lot["minZ"] + lot["maxZ"]) / 2,
        lot["maxX"] - lot["minX"], 0.2, lot["maxZ"] - lot["minZ"])
    box(g, "SIDEWALK", 0, -0.1, 25.2, 160, 0.2, 3.6)
    box(g, "ASPHALT", 0, -0.13, 32.5, 420, 0.1, 10)
    # Seto por delante de la valla, con apertura en el ingreso.
    ex = ATR_X
    gap0, gap1 = ex - 3.5, ex + 3.5
    hz = lot["maxZ"] + 0.9
    ht = 0.9
    box(g, "HEDGE", (lot["minX"] + gap0) / 2, 0.5, hz, gap0 - lot["minX"], 1.0, ht)
    box(g, "HEDGE", (gap1 + lot["maxX"]) / 2, 0.5, hz, lot["maxX"] - gap1, 1.0, ht)
    box(g, "HEDGE", lot["minX"] - 0.9, 0.5, (lot["minZ"] + lot["maxZ"]) / 2, ht, 1.0, lot["maxZ"] - lot["minZ"] + 1.8)
    box(g, "HEDGE", lot["maxX"] + 0.9, 0.5, (lot["minZ"] + lot["maxZ"]) / 2, ht, 1.0, lot["maxZ"] - lot["minZ"] + 1.8)
    box(g, "HEDGE", 0, 0.5, lot["minZ"] - 0.9, lot["maxX"] - lot["minX"], 1.0, ht)

    def run(x0, z0, x1, z1):
        ln = math.hypot(x1 - x0, z1 - z0)
        n = max(1, round(ln / 3))
        for i in range(n + 1):
            box(g, "FRAME_DARK", x0 + (x1 - x0) * i / n, 0.9, z0 + (z1 - z0) * i / n, 0.08, 1.8, 0.08)
        along_x = abs(x1 - x0) >= abs(z1 - z0)
        for y in (0.55, 1.5):
            if along_x:
                box(g, "FRAME_DARK", (x0 + x1) / 2, y, z0, abs(x1 - x0), 0.05, 0.05)
            else:
                box(g, "FRAME_DARK", x0, y, (z0 + z1) / 2, 0.05, 0.05, abs(z1 - z0))

    fz = lot["maxZ"] + 0.1
    run(lot["minX"], fz, gap0, fz)
    run(gap1, fz, lot["maxX"], fz)
    run(lot["minX"], lot["minZ"], lot["minX"], fz)
    run(lot["maxX"], lot["minZ"], lot["maxX"], fz)
    run(lot["minX"], lot["minZ"], lot["maxX"], lot["minZ"])
    for x in (-30, -15, 0, 15, 30):
        box(g, "FRAME_DARK", x, 3.5, 26.4, 0.14, 7, 0.14)
        box(g, "FRAME_DARK", x, 7.0, 27.4, 0.1, 0.1, 2.2)
        box(g, "LAMP_HEAD", x, 6.9, 28.3, 0.5, 0.12, 0.9)
    # Manzanas bajas (2-4 pisos) discretas, lejos del lote y la calle. Posiciones PSEUDOALEATORIAS, no reales.
    rnd = random.Random(20261122)
    i = 0
    for cx in range(-216, 217, 36):
        for cz in range(-216, 253, 36):
            jx, jz = (rnd.random() - 0.5) * 14, (rnd.random() - 0.5) * 14
            sx, sz = 10 + rnd.random() * 12, 10 + rnd.random() * 10
            fls = 2 + int(rnd.random() * 3)
            h = fls * 3 + 0.5 + rnd.random() * 1.2
            keep, mat_r, roof_r = rnd.random(), rnd.random(), rnd.random()
            turn = (rnd.random() - 0.5) * 0.3 if rnd.random() < 0.35 else 0.0
            i += 1
            x, z = cx + jx, cz + jz
            if abs(x) < 64 and -58 < z < 78:
                continue
            if keep > 0.42 or i % 3 != 0 or math.hypot(x, z) > 140:
                continue
            body = "CONTEXT_BRICK" if mat_r < 0.42 else "CONTEXT"
            box(g, body, x, h / 2, z, sx, h, sz, ry=turn)
            box(g, "CONTEXT_ROOF", x, h + 0.15, z, sx + 0.5, 0.3, sz + 0.5, ry=turn)


# --------------------------------------------------------------------------- construccion completa
def build(fine, clip=None, win_split=False, extra=None):
    global FINE, CLIP, WIN_SPLIT
    FINE, CLIP, WIN_SPLIT = fine, clip, win_split
    reset_scene()
    make_materials()
    make_hierarchy()
    build_facade()
    for k in range(N):
        build_floor_slab(k)
        build_curtain_and_generic(k)
        build_corridors_ceilings(k)
        build_rooms(k)
        build_core_doors(k)
        build_stairs(k)
        build_atrium_rails(k)
    build_roof()
    build_atrium_shared()
    build_stairs_shared()
    build_elevators_shared()
    build_context()
    if extra:
        extra()
    flush()
    build_spaces()
    CLIP, WIN_SPLIT = None, False


# --------------------------------------------------------------------------- estadisticas / exportacion
def descendants(root):
    out, stack = [], [root]
    while stack:
        o = stack.pop()
        out.append(o)
        stack.extend(o.children)
    return out


def stats(root_name):
    objs = descendants(EMPTIES_BY_NAME(root_name))
    meshes = [o for o in objs if o.type == "MESH"]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    verts = sum(len(o.data.vertices) for o in meshes)
    return dict(objects=len(objs), meshes=len(meshes), triangles=tris, vertices=verts,
                materials=sorted({m.name for o in meshes for m in o.data.materials if m}))


def EMPTIES_BY_NAME(name):
    return bpy.data.objects[name]


def export_glb(root_name, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    objs = descendants(bpy.data.objects[root_name])
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[root_name]
    kw = dict(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_extras=True, export_cameras=False, export_lights=False, export_animations=False,
        export_materials="EXPORT", export_image_format="NONE", export_texcoords=False, export_normals=True,
        export_draco_mesh_compression_enable=False, export_vertex_color="NONE",
    )
    if USE_MESHOPT:
        kw["export_meshopt_compression_enable"] = True
    bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def build_and_export():
    report = {"blender": bpy.app.version_string, "meshopt": USE_MESHOPT, "draco": False}
    # LOD0
    build(True)
    os.makedirs(HERE, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    report["blend_bytes"] = os.path.getsize(BLEND)
    report["LOD0"] = stats("BUILDING")
    report["LOD0"]["glb_bytes"] = export_glb("BUILDING", os.path.join(MODELS, "utp-huancayo.glb"))
    report["CONTEXT"] = stats("CONTEXT")
    report["CONTEXT"]["glb_bytes"] = export_glb("CONTEXT", os.path.join(MODELS, "utp-context.glb"))
    # LOD1 (movil): sin mobiliario ni luminarias, montantes reducidos; se fusiona por material dentro de cada FLOOR_Pxx.
    build(False)
    report["LOD1"] = stats("BUILDING")
    report["LOD1"]["glb_bytes"] = export_glb("BUILDING", os.path.join(MODELS, "utp-huancayo-mobile.glb"))
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print("BUILD_REPORT", json.dumps(report))


# --------------------------------------------------------------------------- renders de validacion
def set_world(mode):
    sc = bpy.context.scene
    w = bpy.data.worlds.new("UTP_World")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    if mode == "day":
        try:
            sky = nt.nodes.new("ShaderNodeTexSky")
            items = [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items]
            for cand in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "NISHITA"):
                if cand in items:
                    sky.sky_type = cand
                    break
            sky.sun_disc = False
            sky.sun_elevation = math.radians(58)
            sky.sun_rotation = math.radians(220)
            nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
            bg.inputs["Strength"].default_value = 1.0
        except Exception as e:  # sin cielo fisico: color plano
            print("SKY_FALLBACK", e)
            bg.inputs["Color"].default_value = (0.35, 0.55, 0.85, 1)
    else:
        bg.inputs["Color"].default_value = (0.006, 0.012, 0.03, 1)
        bg.inputs["Strength"].default_value = 1.0


def add_sun(energy, color, direction_gltf, name="SUN"):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    ld.color = color
    ld.angle = math.radians(1.2)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    d = gb(*direction_gltf).normalized()
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return ob


def add_area(loc_gltf, target_gltf, size, energy, name="FILL"):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "SQUARE"
    ld.size = size
    ld.energy = energy
    ld.color = (1.0, 0.93, 0.82)
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = gb(*loc_gltf)
    d = (gb(*target_gltf) - ob.location).normalized()
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return ob


def set_camera(pos_gltf, target_gltf, fov_deg):
    cd = bpy.data.cameras.new("CAM")
    cd.sensor_fit = "VERTICAL"
    cd.angle = math.radians(fov_deg)
    cd.clip_end = 3000
    cam = bpy.data.objects.new("CAM", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = gb(*pos_gltf)
    d = (gb(*target_gltf) - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def cam_polar(az_deg, el_deg, dist, target):
    az, el = math.radians(az_deg), math.radians(el_deg)
    return (target[0] + dist * math.cos(el) * math.sin(az), target[1] + dist * math.sin(el),
            target[2] + dist * math.cos(el) * math.cos(az))


def set_emission(values):
    for name, val in values.items():
        m = bpy.data.materials.get(name)
        if m:
            next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value = val


def cutter(center_gltf, size_gltf, name="CUTTER"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((size_gltf[0], size_gltf[2], size_gltf[1], 1.0)), calc_uvs=False)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = gb(*center_gltf)
    ob.hide_render = True
    ob.display_type = "WIRE"
    bpy.context.scene.collection.objects.link(ob)
    return ob


def boolean(ob, cut, op):
    md = ob.modifiers.new("CUT", "BOOLEAN")
    md.operation = op
    md.object = cut
    md.solver = "EXACT"


def render_setup(path):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1280, 800, 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    if sc.render.engine.startswith("BLENDER_EEVEE"):
        sc.eevee.taa_render_samples = 24
    else:
        sc.cycles.samples = 24
        sc.cycles.use_denoising = False


def do_render(name, setup_fn, rebuild=None):
    """rebuild=None: abre el .blend LOD0. rebuild=dict: reconstruye la escena con recorte analitico (secciones)."""
    if rebuild is None:
        bpy.ops.wm.open_mainfile(filepath=BLEND)
    else:
        build(True, **rebuild)
    for o in bpy.data.objects:
        if o.name.startswith("SPC_") or o.name.startswith("ANCHOR_"):
            o.hide_render = True
    path = os.path.join(RENDERS, name)
    os.makedirs(RENDERS, exist_ok=True)
    setup_fn()
    render_setup(path)
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as e:
        print("RENDER_ERROR", name, e, "-> reintento con Cycles")
        bpy.context.scene.render.engine = "CYCLES"
        bpy.context.scene.cycles.samples = 16
        bpy.ops.render.render(write_still=True)
    print("RENDER_OK", path, os.path.getsize(path), bpy.context.scene.render.engine)


SUN_DIR = (-40, 70, 35)  # direccion del sol de la especificacion (5.3)


def exterior_cam():
    target = (0, 18.5, 0)
    set_camera(cam_polar(-30, 13, 100, target), target, 35)


def set_world_strength(v):
    bg = next(n for n in bpy.context.scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Strength"].default_value = v


def setup_day():
    set_world("day")
    set_world_strength(0.55)
    add_sun(2.6, (1.0, 0.96, 0.9), SUN_DIR)
    for o in bpy.data.objects:
        if "WINDOW_NIGHT" in o.name:
            o.hide_render = True
    set_emission({"LED_CROWN": 0.0, "LIGHT_PANEL": 1.0, "LAMP_HEAD": 0.0})
    exterior_cam()


def setup_night():
    set_world("night")
    add_sun(0.35, (0.55, 0.65, 1.0), (30, 60, 40), "MOON")
    for o in bpy.data.objects:
        if "WINDOW_NIGHT" in o.name and o.type == "MESH":
            m = o.data.materials[0].copy()
            h = zlib.crc32(o.name.encode())
            strength = 0.0 if h % 4 == 0 else 0.9 + (h % 7) * 0.3
            next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value = strength
            o.data.materials[0] = m
    set_emission({"LED_CROWN": 3.0, "LIGHT_PANEL": 2.0, "LAMP_HEAD": 6.0})
    exterior_cam()


def setup_atrium():
    set_world("day")
    set_world_strength(0.6)
    add_sun(2.6, (1.0, 0.96, 0.9), SUN_DIR)
    add_area((-6, 14, 42), (2, 9, 0), 30, 5500)
    set_emission({"LED_CROWN": 0.0, "LIGHT_PANEL": 4.0})
    set_camera((-12, 10.5, 46), (2.0, 10.5, 0), 36)


def setup_floor_p03():
    set_world("day")
    set_world_strength(0.7)
    add_sun(2.6, (1.0, 0.96, 0.9), SUN_DIR)
    set_emission({"LED_CROWN": 0.0, "LIGHT_PANEL": 3.0})
    set_camera(cam_polar(-35, 38, 52, (0, 9.5, 0)), (0, 9.5, 0), 34)


def floor_ground():
    global CLIP
    saved, CLIP = CLIP, None
    box("CONTEXT", "GROUND", 0, 7.4, 0, 60, 0.2, 52)  # plataforma neutra bajo el piso aislado (solo render)
    CLIP = saved


ATRIUM_CLIP = dict(zmax=5.6, skip={"CONTEXT"})  # corte de seccion: quita todo lo que queda delante de z=+5.6 m
_K = 2
FLOOR_CLIP = dict(
    skip=(set(FLOOR_GROUPS) - {FLOOR_GROUPS[_K]}) | {"ROOF", "CONTEXT"},
    skip_mats={"CEILING"},  # sin falso cielo para que se vea la planta
    y=(base(_K) - 0.3, base(_K) + height(_K)),
    y_groups={"FACADE", "ELEVATORS", "STAIRS", "ATRIUM"},  # compartidos: solo su tramo del piso 3
)


def render_all():
    do_render("exterior-dia.png", setup_day)
    do_render("exterior-noche.png", setup_night, dict(win_split=True))
    do_render("atrio.png", setup_atrium, dict(clip=ATRIUM_CLIP))
    do_render("piso-P03-aislado.png", setup_floor_p03, dict(clip=FLOOR_CLIP, extra=floor_ground))


# --------------------------------------------------------------------------- main
if __name__ == "__main__":
    if not ONLY_RENDER:
        build_and_export()
    if not SKIP_RENDER:
        render_all()
