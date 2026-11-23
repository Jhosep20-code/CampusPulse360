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
RENDER_ONLY = [a.split("=", 1)[1].split(",") for a in ARGV if a.startswith("--render=")]
RENDER_ONLY = RENDER_ONLY[0] if RENDER_ONLY else None   # p. ej. --render=escaleras.png,ascensores.png
_OUT = [a.split("=", 1)[1] for a in ARGV if a.startswith("--out=")]   # carpeta alternativa de renders (antes/despues)
RES = None           # resolucion de la vista en curso (None = 1280 x 800)

# --------------------------------------------------------------------------- dimensiones (ESTIMADAS)
# Mismos valores que apps/web/src/twin/constants.ts (DEFAULT_DIMS). Ninguno es una medicion real.
W, DP = 38.0, 30.0              # frente (X) y fondo (Z)
N = 10                          # niveles (dato del equipo)
H_GROUND, H_FLOOR, CROWN = 4.8, 3.6, 2.4
SLAB_T, WALL_T = 0.3, 0.6
HEADROOM, WALL_INSET, FRONT_SETBACK = 0.4, 0.8, 1.8
CORR = 2.4
ATR_W, ATR_D, ATR_X = 12.0, 9.0, 2.0   # v2: vacio de 12 x 9 m (ESTIMADO), deja pasillo de 2,4 m ante el nucleo
CORE_W, CORE_D = 6.0, 9.0
# v3: 7 franjas grandes con un montante fino intermedio (videos: vidrio estructural con montantes oscuros marcados).
# El paño blanco ciego de la izquierda ocupa ~28 % del frente (foto exterior); ancho ESTIMADO.
BAYS, PANES = 7, 2
PIER_L, EDGE_R = 10.5, 0.6
G_PIERS, PIER_S, G_SETBACK, SIGN_H = 7, 0.6, 1.5, 1.0
MARQ_W, MARQ_D, MARQ_T, MARQ_Y = 10.0, 4.0, 0.25, 3.5
ROOFBOX_W, ROOFBOX_D, ROOFBOX_H, ROOFBOX_X, ROOFBOX_Z = 14.0, 8.0, 3.0, -6.0, -6.0

ATR = dict(minX=ATR_X - ATR_W / 2, maxX=ATR_X + ATR_W / 2, minZ=-ATR_D / 2, maxZ=ATR_D / 2)
CORE = dict(minX=ATR["maxX"] + CORR, maxX=ATR["maxX"] + CORR + CORE_W, minZ=-CORE_D / 2, maxZ=CORE_D / 2)
OUTER_Z = ATR_D / 2 + CORR
XR = (-W / 2 + WALL_INSET, W / 2 - WALL_INSET)
_INNER = OUTER_Z + 0.1
FRONT_Z = (_INNER, DP / 2 - FRONT_SETBACK)
BACK_Z = (-(DP / 2 - WALL_INSET), -_INNER)
# Escaleras v3. Tres referencias autenticas coinciden en tramos rectos abiertos en zigzag, paralelos al muro de
# ascensores y en el borde del vacio OPUESTO al nucleo: el short y el video los muestran delante de la camara con el
# muro negro al fondo, y la foto tomada frente al muro de ascensores no los muestra delante del muro.
# Dos carriles contiguos (ida y vuelta) y descansos en las esquinas oeste del vacio, unidos a los pasillos.
# Lado y forma INFERIDOS de esas tres vistas; longitudes y anchos ESTIMADOS (sin planos).
STAIR_W = 1.5
STAIR_GAP = 0.12
STAIR_LANES = (ATR_X - ATR_W / 2 + 0.1 + STAIR_W / 2, ATR_X - ATR_W / 2 + 0.1 + STAIR_W * 1.5 + STAIR_GAP)
STAIR_RUN = 6.8                                   # proyeccion horizontal de cada tramo (Z)
STAIR_X1 = STAIR_LANES[1] + STAIR_W / 2           # borde este de los descansos
CWX0, CWX1 = -W / 2 + PIER_L, W / 2 - EDGE_R
CWW = CWX1 - CWX0
CWCX = (CWX0 + CWX1) / 2
COLS = BAYS * PANES
COLW = CWW / COLS
GLASS_Z = DP / 2 - 0.15


def stair_lane(k):
    """Centro X del carril del tramo que sale del piso k (0-based)."""
    return STAIR_LANES[k % 2]


def stair_end(k):
    """Extremo (+1 frente / -1 fondo) donde ARRANCA el tramo del piso k: alli esta el descanso del nivel k."""
    return 1 if k % 2 == 0 else -1


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
FURNISH = {"SPC_1_BIB": "library", "SPC_2_A201": "classroom", "SPC_2_A202": "classroom", "SPC_3_LAB1": "lab",
           "SPC_4_LAB2": "wetlab", "SPC_5_AUD": "auditorium"}
BOOK_MATS = ["BOOKS_A", "BOOKS_B", "BOOKS_C"]

# --------------------------------------------------------------------------- materiales PBR
# nombre: (hex sRGB, roughness, metallic, alpha, emision hex | None)
MATERIAL_SPECS = {
    "GLASS_CURTAIN": ("#4585CF", 0.03, 0.68, 0.9, None),
    "WHITE_PANEL": ("#E6E8EA", 0.6, 0.0, 1.0, None),
    "FRAME_DARK": ("#1A1F26", 0.4, 0.6, 1.0, None),
    "GLASS_GROUND": ("#0E1724", 0.1, 0.3, 0.85, None),
    "GLASS_CLEAR": ("#8FD0DC", 0.05, 0.1, 0.4, None),
    "ROOF": ("#B9BEC4", 0.85, 0.0, 1.0, None),
    "BRAND_RED": ("#C8102E", 0.5, 0.0, 1.0, None),
    "SLAB": ("#C9D3DD", 0.75, 0.0, 1.0, None),          # fondo de losa gris azulado claro
    "SLAB_FACE": ("#949FAD", 0.55, 0.0, 1.0, None),     # v3: bandas gris azulado alrededor del vacio (foto y short)
    "STAIR_STRINGER": ("#3A3F48", 0.45, 0.6, 1.0, None),  # zancas y fondo oscuros (video)
    "STEEL_DOOR": ("#D5DAE0", 0.35, 0.85, 1.0, None),
    "ELEV_INDICATOR": ("#FF3B30", 0.5, 0.0, 1.0, "#FF3B30"),  # indicadores rojos (foto)
    "CHAIR_RED": ("#B3262E", 0.6, 0.0, 1.0, None),
    "PANEL_JOINT": ("#8E97A4", 0.7, 0.0, 1.0, None),
    "CORE_BLACK": ("#0B0C0F", 0.12, 0.6, 1.0, None),
    "STEEL": ("#B7C0CC", 0.3, 0.9, 1.0, None),
    "TILE": ("#D9D2C5", 0.55, 0.0, 1.0, None),
    "WOOD": ("#D7A24C", 0.55, 0.0, 1.0, None),          # puertas mostaza/madera (foto y video)
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
EMISSIVE = ("LIGHT_PANEL", "WINDOW_NIGHT", "LED_CROWN", "LAMP_HEAD", "ELEV_INDICATOR")

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
    FONT.clear()
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
    if group in BANDED and rx == 0 and ry == 0:
        # v3: los elementos compartidos de todo el alto se cortan por franja de piso (band_level). El visor dibuja cada
        # tramo con su piso al aislar/explotar, sin copias recortadas por clipping planes (menos draw calls).
        y0, y1 = y - sy / 2, y + sy / 2
        for lv in range(1, N + 1):
            lo = -1e9 if lv == 1 else base(lv - 1)
            hi = 1e9 if lv == N else base(lv)
            a, b_ = max(y0, lo), min(y1, hi)
            if b_ - a > 1e-4:
                _emit((group, mat, tag, lv), x, (a + b_) / 2, z, sx, b_ - a, sz, rx, ry)
        return
    _emit((group, mat, tag, None), x, y, z, sx, sy, sz, rx, ry)


BANDED = {"FACADE", "ELEVATORS"}


def _emit(key, x, y, z, sx, sy, sz, rx, ry):
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
    for (group, mat, tag, band), bm in ACC.items():
        name = f"{group}_{mat}" + (f"_{tag}" if tag else "") + (f"_L{band:02d}" if band else "")
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
        if band:
            ob["band_level"] = band
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


FONT = {}


def glyph(group, mat, ch, x, y, z, size, depth=0.08):
    """Letra extruida (fuente integrada de Blender, reproducible) en el plano de la fachada principal (+Z glTF)."""
    if CLIP is not None:
        if group in CLIP.get("skip", ()) or ("zmax" in CLIP and z > CLIP["zmax"]):
            return
        if "y" in CLIP and group in CLIP.get("y_groups", ()) and not (CLIP["y"][0] <= y <= CLIP["y"][1]):
            return
    if "f" not in FONT:
        FONT["f"] = bpy.data.fonts.load("<builtin>")
    cu = bpy.data.curves.new("GLYPH", "FONT")
    cu.body = ch
    cu.font = FONT["f"]
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.size = size
    cu.extrude = depth / 2
    cu.resolution_u = 4 if FINE else 2
    ob = bpy.data.objects.new("GLYPH", cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    # Local del texto: X derecha, Y arriba, Z hacia fuera -> Blender: X, Z(arriba), -Y (fachada +Z glTF).
    rot = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    me.transform(Matrix.Translation(gb(x, y, z)) @ rot)
    key = (group, mat, None, None)
    bm = ACC.get(key)
    if bm is None:
        bm = bmesh.new()
        ACC[key] = bm
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


# --------------------------------------------------------------------------- FACADE (compartido)
def build_facade():
    g = "FACADE"
    h = ROOF_Y
    # Volumenes macizos continuos de todo el alto: lateral izquierdo CIEGO, posterior, derecho, pilastra y borde.
    box(g, "WHITE_PANEL", -W / 2 + WALL_T / 2, h / 2, -0.2, WALL_T, h, DP - 1.6)
    box(g, "WHITE_PANEL", 0, h / 2, -DP / 2 + WALL_T / 2, W, h, WALL_T)
    box(g, "WHITE_PANEL", W / 2 - WALL_T / 2, h / 2, 0.3, WALL_T, h, DP - 0.6)
    box(g, "WHITE_PANEL", -W / 2 + PIER_L / 2, h / 2, DP / 2 - 0.5, PIER_L, h, 1.0)
    # Juntas horizontales de los paneles de revestimiento (verificado en video; modulo de 1,2 m ESTIMADO).
    ys = [1.2 * i for i in range(1, int(h / 1.2) + 1) if 1.2 * i < h - 0.1]
    for y in ys:
        box(g, "PANEL_JOINT", -W / 2 - 0.006, y, -0.2, 0.012, 0.035, DP - 1.6)
        box(g, "PANEL_JOINT", 0, y, -DP / 2 - 0.006, W, 0.035, 0.012)
        box(g, "PANEL_JOINT", W / 2 + 0.006, y, 0.3, 0.012, 0.035, DP - 0.6)
        box(g, "PANEL_JOINT", -W / 2 + PIER_L / 2, y, DP / 2 + 0.006, PIER_L, 0.035, 0.012)
        box(g, "PANEL_JOINT", W / 2 - EDGE_R / 2, y, DP / 2 + 0.006, EDGE_R, 0.035, 0.012)
    # v3: bruna vertical que separa el paño ciego en dos volumenes (foto exterior; posicion ESTIMADA).
    box(g, "PANEL_JOINT", -W / 2 + 4.2, h / 2, DP / 2 + 0.01, 0.12, h, 0.02)
    # v3: marco de aluminio gris claro alrededor del muro cortina (foto y video), del 2.o nivel a la coronacion.
    fy0 = H_GROUND - 0.55
    fh = ROOF_Y - fy0
    box(g, "ROOF", CWX0 - 0.3, fy0 + fh / 2, DP / 2 - 0.2, 0.6, fh, 0.8)
    box(g, "ROOF", (CWX1 + W / 2) / 2 + 0.01, fy0 + fh / 2, DP / 2 - 0.2, W / 2 - CWX1 + 0.04, fh, 0.8)


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
    slab_cells(g, "SLAB", yc, SLAB_T, (-sw / 2, sw / 2, -sd / 2, sd / 2), holes)
    # Frentes de losa del atrio: bandas gris azulado de ~0,9 m de canto (foto y short; canto ESTIMADO) en los 4 lados.
    f = 0.12
    fh = 0.9
    fy = b + SLAB_T + 0.02 - fh / 2
    cxm = (ATR["minX"] + ATR["maxX"]) / 2
    box(g, "SLAB_FACE", cxm, fy, ATR["maxZ"] + f / 2, ATR_W, fh, f)
    box(g, "SLAB_FACE", cxm, fy, ATR["minZ"] - f / 2, ATR_W, fh, f)
    box(g, "SLAB_FACE", ATR["minX"] - f / 2, fy, 0, f, fh, ATR_D + 2 * f)
    box(g, "SLAB_FACE", ATR["maxX"] + f / 2, fy, 0, f, fh, ATR_D + 2 * f)


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
        box(g, "ROOF", CWCX, H - SIGN_H / 2, DP / 2 - 0.25, CWW + 0.6, SIGN_H, 0.5)   # banda gris bajo el muro cortina (foto)
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
        box(g, "FRAME_DARK", CWCX, b + 0.08, GLASS_Z + 0.04, CWW, 0.18, 0.3)
        for bay in range(BAYS + 1):
            box(g, "FRAME_DARK", CWX0 + bay * CWW / BAYS, yc, GLASS_Z + 0.08, 0.36, H, 0.45)
        for c in range(1, COLS):
            if c % PANES == 0:
                continue
            if not FINE and c % PANES != 2:
                continue  # LOD1: solo el montante secundario central de cada franja
            box(g, "FRAME_DARK", CWX0 + c * COLW, yc, GLASS_Z + 0.04, 0.06, H, 0.12)
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

    def tile(x0, x1, z0, z1):
        box(g, "TILE", (x0 + x1) / 2, tile_y, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0)

    def light(x, z):
        box(g, "LIGHT_PANEL", x, ceil_y - 0.015, z, 0.6, 0.03, 0.6, fine=True)

    # Pasillo perimetral: rodea el vacio por los cuatro lados; el nucleo queda al este con un pasillo delante.
    if k == 0:
        tile(tx0, CORE["maxX"], -OUTER_Z, OUTER_Z)
    else:
        tile(tx0, CORE["maxX"], ATR["maxZ"], OUTER_Z)
        tile(tx0, CORE["maxX"], -OUTER_Z, ATR["minZ"])
        tile(tx0, ATR["minX"], ATR["minZ"], ATR["maxZ"])
        tile(ATR["maxX"], CORE["minX"], ATR["minZ"], ATR["maxZ"])
    # Falso cielo blanco sobre los pasillos (el vacio del atrio queda abierto) y luminarias LED cuadradas.
    ceiling(tx0, CORE["maxX"], ATR["maxZ"], OUTER_Z)
    ceiling(tx0, CORE["maxX"], -OUTER_Z, ATR["minZ"])
    ceiling(tx0, ATR["minX"], ATR["minZ"], ATR["maxZ"])
    ceiling(ATR["maxX"], CORE["minX"], ATR["minZ"], ATR["maxZ"])
    x = tx0 + 0.9
    while x < CORE["maxX"] - 0.3:
        light(x, (ATR["maxZ"] + OUTER_Z) / 2)
        light(x, -(ATR["maxZ"] + OUTER_Z) / 2)
        x += 3
    for z in (-3, 0, 3):
        light((tx0 + ATR["minX"]) / 2, z)
        light((ATR["maxX"] + CORE["minX"]) / 2, z)


def build_rooms(k):
    """Ambientes de cada piso: piso, falso cielo, luminarias, tabique blanco con puertas de madera clara y franja alta
    de vidrio hacia el pasillo, y mobiliario representativo (P1-P5)."""
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
        # Tabique blanco hacia el pasillo: puertas de madera clara y, encima, franja alta de vidrio (ambas filas).
        wz = z0 - 0.05 if row == 0 else z1 + 0.05
        n_doors = max(1, round(sx / 7.5))
        door_w = 0.95
        wall_top = ceil_y - y0
        cursor = x0

        def part(xc, ln):
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
        gl_h = min(0.65, wall_top - 2.3)
        box(g, "GLASS_CLEAR", cx, y0 + 2.3 + gl_h / 2, wz, sx, gl_h, 0.04)
        rest = wall_top - 2.3 - gl_h
        if rest > 0.02:
            box(g, "WHITE_PANEL", cx, y0 + 2.3 + gl_h + rest / 2, wz, sx, rest, 0.1)
        kind = FURNISH.get(sid) if sid else None
        if kind and FINE:
            furnish(g, kind, row, cx, cz, sx, sz, y0)


def furnish(g, kind, row, sx_c, sz_c, sx, sz, y0):
    """Mobiliario representativo (solo LOD0, solo P1-P5). Existencia verificada en video; distribucion NO verificada."""
    wall_z = sz_c - sz / 2 if row == 1 else sz_c + sz / 2   # muro del fondo (lejos del pasillo)
    d = 1 if row == 1 else -1                               # sentido hacia el interior del ambiente
    fl_y = y0 + 0.02
    x0 = sx_c - sx / 2

    def chair(x, z, face, mat="FURN_DARK"):
        """Silla de asiento 0,42 m mirando hacia face (+1/-1 en z)."""
        box(g, mat, x, fl_y + 0.45, z, 0.42, 0.04, 0.42)
        box(g, mat, x, fl_y + 0.68, z - face * 0.2, 0.42, 0.42, 0.04)
        box(g, "STEEL", x, fl_y + 0.22, z, 0.05, 0.44, 0.05)

    if kind in ("classroom", "lab", "wetlab") and row == 1:
        nb = max(1, int(sx // 9))
        for i in range(nb):
            box(g, "CEILING", x0 + (i + 0.5) * sx / nb, fl_y + 1.6, wall_z + d * 0.04, 3.2, 1.2, 0.04)  # pizarras
    if kind == "classroom":
        # Aula con carpetas (pupitres unipersonales) en cuadricula.
        step = 1.5
        cols = max(1, int((sx - 3) // step) + 1)
        xs = sx_c - (cols - 1) * step / 2
        for r in range(4):
            z = wall_z + d * (1.9 + r * 1.2)
            for i in range(cols):
                x = xs + i * step
                box(g, "WOOD", x, fl_y + 0.74, z, 0.6, 0.04, 0.45)
                box(g, "FURN_DARK", x, fl_y + 0.37, z, 0.06, 0.72, 0.06)
                box(g, "FURN_DARK", x, fl_y + 0.45, z + d * 0.42, 0.4, 0.04, 0.38)
                box(g, "FURN_DARK", x, fl_y + 0.65, z + d * 0.6, 0.4, 0.34, 0.04)
    elif kind == "lab":
        # Laboratorio de computo: mesas largas con monitores y sillas.
        segs = max(1, int((sx - 2) // 3.4))
        xs = sx_c - (segs - 1) * 3.4 / 2
        for r in range(2):
            z = wall_z + d * (2.6 + r * 3.0)
            for i in range(segs):
                x = xs + i * 3.4
                box(g, "WOOD", x, fl_y + 0.74, z, 3.0, 0.05, 0.8)
                box(g, "FURN_DARK", x, fl_y + 0.38, z - d * 0.34, 2.9, 0.72, 0.04)
                for dx in (-0.75, 0.75):
                    box(g, "FURN_DARK", x + dx, fl_y + 0.98, z - d * 0.1, 0.58, 0.36, 0.03)
                    box(g, "SCREEN", x + dx, fl_y + 0.98, z - d * 0.1 + d * 0.02, 0.52, 0.3, 0.012)
                    box(g, "FURN_DARK", x + dx, fl_y + 0.82, z - d * 0.1, 0.06, 0.12, 0.06)
                    chair(x + dx, z + d * 0.85, -d)
    elif kind == "wetlab":
        # Laboratorio con mesones blancos y pozas (lavaderos) con grifo.
        segs = max(1, int((sx - 2) // 3.4))
        xs = sx_c - (segs - 1) * 3.4 / 2
        for r in range(2):
            z = wall_z + d * (2.8 + r * 2.8)
            for i in range(segs):
                x = xs + i * 3.4
                box(g, "WHITE_PANEL", x, fl_y + 0.43, z, 3.0, 0.86, 0.9)
                box(g, "CEILING", x, fl_y + 0.89, z, 3.06, 0.05, 0.96)
                for dx in (-0.8, 0.8):
                    box(g, "FURN_DARK", x + dx, fl_y + 0.915, z, 0.6, 0.02, 0.4)
                    box(g, "STEEL", x + dx, fl_y + 1.1, z - d * 0.3, 0.03, 0.4, 0.03)
                    box(g, "STEEL", x + dx, fl_y + 1.3, z - d * 0.22, 0.03, 0.03, 0.2)
    elif kind == "library":
        # Biblioteca: estantes al fondo, mesas de lectura con sillas rojas.
        units = max(1, int((sx - 2) // 2.7))
        xs = sx_c - (units - 1) * 2.7 / 2
        rnd = random.Random(1301)
        for r in range(2):
            z = wall_z + d * (1.0 + r * 1.8)
            for i in range(units):
                x = xs + i * 2.7
                box(g, "WOOD", x, fl_y + 1.0, z, 2.3, 2.0, 0.45)
                for bk in range(3):
                    box(g, rnd.choice(BOOK_MATS), x, fl_y + 0.5 + bk * 0.5, z + d * 0.255, 2.15, 0.28, 0.07)
        tabs = max(1, int((sx - 2) // 3.2))
        xt = sx_c - (tabs - 1) * 3.2 / 2
        for i in range(tabs):
            x = xt + i * 3.2
            z = wall_z + d * 5.0
            box(g, "WOOD", x, fl_y + 0.74, z, 2.6, 0.05, 0.9)
            box(g, "FURN_DARK", x, fl_y + 0.37, z, 2.4, 0.72, 0.06)
            for dx in (-0.9, 0.0, 0.9):
                chair(x + dx, z - 0.7, 1, "CHAIR_RED")
                chair(x + dx, z + 0.7, -1, "CHAIR_RED")
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
    """3 ascensores por nivel sobre la cara OESTE del nucleo negro (CORE_BLACK), que MIRA AL ATRIO.
    Verificado en video: muro negro brillante con puertas de acero frente al vacio. Cada puerta: marco de acero,
    2 hojas, indicador emisivo encima; botonera entre puertas. Numero exacto de puertas: estimado (se ven ~3)."""
    g = fl(k)
    y0 = base(k) + SLAB_T
    xf = CORE["minX"]
    pitch = CORE_D / 3
    zs = [-pitch, 0.0, pitch]
    for zc in zs:
        box(g, "STEEL", xf - 0.03, y0 + 2.25, zc, 0.06, 0.1, 1.5)
        for sgn in (-1, 1):
            box(g, "STEEL", xf - 0.03, y0 + 1.15, zc + sgn * 0.72, 0.06, 2.3, 0.08)
        for sgn in (-1, 1):
            box(g, "STEEL_DOOR", xf - 0.02, y0 + 1.09, zc + sgn * 0.33, 0.04, 2.18, 0.65)
        box(g, "ELEV_INDICATOR", xf - 0.03, y0 + 2.55, zc, 0.03, 0.1, 0.3)
    for zb in (-pitch / 2, pitch / 2):
        box(g, "WHITE_PANEL", xf - 0.02, y0 + 1.75, zb, 0.02, 0.42, 0.3, fine=True)   # senaletica (foto: placas claras)
        box(g, "STEEL", xf - 0.02, y0 + 1.1, zb, 0.03, 0.34, 0.12)
        box(g, "ELEV_INDICATOR", xf - 0.04, y0 + 1.18, zb, 0.015, 0.04, 0.04, fine=True)
        box(g, "ELEV_INDICATOR", xf - 0.04, y0 + 1.04, zb, 0.015, 0.04, 0.04, fine=True)


def build_stairs(k):
    """v3: tramo recto ABIERTO del nivel k al k+1, paralelo al muro de ascensores, en el borde oeste del vacio.
    Ida y vuelta en dos carriles contiguos (zigzag visto de frente) con descansos en las esquinas oeste del vacio.
    Zancas y fondo oscuros, peldanos claros sin contrahuella y barandas de acero de tubos horizontales."""
    g = fl(k)
    y_lo = base(k) + SLAB_T
    if k >= 1:
        # Descanso del nivel k (llega el tramo k-1 por un carril y sale el tramo k por el otro).
        e = stair_end(k)
        za, zb = sorted((e * STAIR_RUN / 2, e * (ATR_D / 2)))
        x0 = ATR["minX"]
        box(g, "SLAB", (x0 + STAIR_X1) / 2, base(k) + SLAB_T / 2, (za + zb) / 2, STAIR_X1 - x0, SLAB_T, zb - za)
        box(g, "STAIR_STRINGER", (x0 + STAIR_X1) / 2, base(k) - 0.12, (za + zb) / 2, STAIR_X1 - x0, 0.24, zb - za)
        # Baranda del borde libre del descanso (lado del vacio).
        for dy in ((0.3, 0.55, 0.8, 1.05) if FINE else (0.55, 1.05)):
            box(g, "STEEL", STAIR_X1 - 0.03, y_lo + dy, (za + zb) / 2, 0.045, 0.045, zb - za)
        for zz in (za, zb):
            box(g, "STEEL", STAIR_X1 - 0.03, y_lo + 0.525, zz, 0.05, 1.05, 0.05)
    if k >= N - 1:
        return
    R = height(k)
    e = stair_end(k)
    d = -e                       # sentido de avance en Z
    z_s = e * STAIR_RUN / 2
    L = STAIR_RUN
    cx = stair_lane(k)
    w = STAIR_W
    n = round(R / (0.18 if FINE else 0.3))
    riser = R / n
    p = L / (n - 1)
    for j in range(1, n):
        box(g, "SLAB", cx, y_lo + j * riser - 0.025, z_s + d * (j - 0.5) * p, w - 0.12, 0.05, min(p + 0.03, 0.34))
    th = math.atan2(R, L)
    Ls = math.hypot(L, R) + 0.1
    rx = -th if d > 0 else th
    ym, zm = y_lo + R / 2, z_s + d * L / 2
    off = 0.17
    for s_ in (-1, 1):
        box(g, "STAIR_STRINGER", cx + s_ * (w / 2 - 0.03), ym - 0.02, zm, 0.06, 0.34, Ls, rx=rx)
    box(g, "STAIR_STRINGER", cx, ym - 0.02 - off * math.cos(th), zm + d * off * math.sin(th), w - 0.06, 0.04, Ls, rx=rx)
    heights = (0.3, 0.55, 0.8) if FINE else (0.6,)
    for s_ in (-1, 1):
        xr = cx + s_ * (w / 2 - 0.03)
        for hh in heights:
            box(g, "STEEL", xr, ym + hh, zm, 0.04, 0.04, Ls, rx=rx)
        box(g, "STEEL", xr, ym + 1.05, zm, 0.06, 0.06, Ls, rx=rx)
        m = max(2, round(L / (1.4 if FINE else 3.0)))
        for i in range(m + 1):
            t = i * L / m
            box(g, "STEEL", xr, y_lo + R * t / L + 0.55, z_s + d * t, 0.05, 1.0, 0.05)


def build_atrium_rails(k):
    """Barandas de acero de tubos horizontales en el borde del vacio (foto: 4-5 tubos y pasamanos). El borde oeste
    queda libre junto a los tramos; en la esquina del descanso de cada nivel la baranda se abre hacia el pasillo."""
    if k == 0:
        return
    g = fl(k)
    y0 = base(k) + SLAB_T
    detailed = k < 5 and FINE
    rows = [0.25, 0.5, 0.75, 1.0] if detailed else ([0.35, 0.7, 1.0] if FINE else [0.55, 1.0])

    def post(x, z):
        box(g, "STEEL", x, y0 + 0.525, z, 0.05, 1.05, 0.05)

    def run_x(z, a, b):
        if b - a < 0.05:
            return
        for dy in rows:
            box(g, "STEEL", (a + b) / 2, y0 + dy, z, b - a, 0.04, 0.04)
        box(g, "STEEL", (a + b) / 2, y0 + 1.08, z, b - a, 0.07, 0.07)
        m = max(1, round((b - a) / (1.5 if detailed else 3.0)))
        for i in range(m + 1):
            post(a + i * (b - a) / m, z)

    def run_z(x, a, b):
        if b - a < 0.05:
            return
        for dy in rows:
            box(g, "STEEL", x, y0 + dy, (a + b) / 2, 0.04, 0.04, b - a)
        box(g, "STEEL", x, y0 + 1.08, (a + b) / 2, 0.07, 0.07, b - a)
        m = max(1, round((b - a) / (1.5 if detailed else 3.0)))
        for i in range(m + 1):
            post(x, a + i * (b - a) / m)

    xa, xb = ATR["minX"] + 0.06, ATR["maxX"] - 0.06
    e = stair_end(k)
    for sgn, z in ((1, ATR["maxZ"] - 0.06), (-1, ATR["minZ"] + 0.06)):
        # En el extremo del descanso, la baranda del pasillo frente/fondo empieza donde acaba el descanso.
        run_x(z, STAIR_X1 if sgn == e else xa, xb)
    # Borde oeste: baranda entre los dos extremos de tramo (los tramos corren pegados a este borde).
    run_z(xa, -STAIR_RUN / 2, STAIR_RUN / 2)
    if e != 1:
        run_z(xa, STAIR_RUN / 2, ATR["maxZ"] - 0.06)
    if e != -1:
        run_z(xa, ATR["minZ"] + 0.06, -STAIR_RUN / 2)
    run_z(xb, ATR["minZ"] + 0.06, ATR["maxZ"] - 0.06)


# --------------------------------------------------------------------------- cubierta / compartidos
def build_roof():
    g = "ROOF"
    cy = ROOF_Y + CROWN / 2
    holes = [(ATR["minX"], ATR["maxX"], ATR["minZ"], ATR["maxZ"])]  # el atrio se cierra con la claraboya (ATRIUM)
    slab_cells(g, "ROOF", ROOF_Y + SLAB_T / 2, SLAB_T, (-(W - 0.2) / 2, (W - 0.2) / 2, -(DP - 0.2) / 2, (DP - 0.2) / 2), holes)
    xs = CWX0 - 0.6   # v3: coronacion de aluminio gris sobre el muro cortina y blanca sobre el paño ciego (foto)
    box(g, "WHITE_PANEL", (-W / 2 + xs) / 2, cy, DP / 2 - WALL_T / 2, xs + W / 2, CROWN, WALL_T)
    box(g, "ROOF", (xs + W / 2) / 2, cy, DP / 2 - WALL_T / 2 + 0.004, W / 2 - xs, CROWN, WALL_T)
    box(g, "WHITE_PANEL", 0, cy, -DP / 2 + WALL_T / 2, W, CROWN, WALL_T)
    box(g, "WHITE_PANEL", -W / 2 + WALL_T / 2, cy, 0, WALL_T, CROWN, DP - 2 * WALL_T)
    box(g, "WHITE_PANEL", W / 2 - WALL_T / 2, cy, 0, WALL_T, CROWN, DP - 2 * WALL_T)
    red_x0 = W / 2 - 0.3
    for dy in (CROWN / 3, 2 * CROWN / 3):
        box(g, "PANEL_JOINT", (-W / 2 + red_x0 - 0.1) / 2, ROOF_Y + dy, DP / 2 + 0.006, red_x0 - 0.1 + W / 2, 0.035, 0.012)
        box(g, "PANEL_JOINT", -W / 2 - 0.006, ROOF_Y + dy, 0, 0.012, 0.035, DP - 2 * WALL_T)
        box(g, "PANEL_JOINT", W / 2 + 0.006, ROOF_Y + dy, 0, 0.012, 0.035, DP - 2 * WALL_T)
        box(g, "PANEL_JOINT", 0, ROOF_Y + dy, -DP / 2 - 0.006, W, 0.035, 0.012)
    # Marca institucional (foto exterior y video): tres cuadros escalonados U (rojo) T (oscuro) / P (rojo) con letras
    # blancas, arriba a la derecha del muro cortina. Representacion geometrica simplificada; tamano ESTIMADO.
    sq, gp = 2.9, 0.12
    xt = CWX1 - 0.9 - sq / 2
    xu = xt - sq - gp
    yt = ROOF_Y - 0.6 - sq / 2
    yp = yt - sq - gp
    zl = DP / 2 + 0.32
    for (xx, yy, mat, ch) in ((xu, yt, "BRAND_RED", "U"), (xt, yt, "FRAME_DARK", "T"), (xt, yp, "BRAND_RED", "P")):
        box(g, mat, xx, yy, zl, sq, sq, 0.14)
        glyph(g, "WHITE_PANEL", ch, xx, yy - 0.05, zl + 0.07 + 0.04, sq * 0.78)
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
    g = "ROOF"   # v3: la claraboya viaja con la cubierta (se oculta al aislar un piso); ATRIUM queda como nodo
    # v3: sin pilares en las esquinas del vacio (no aparecen en ninguna referencia: las losas vuelan sobre el vacio).
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
    """v2: los tramos pertenecen a cada FLOOR_Pxx; el grupo STAIRS queda como nodo vacio (nada es compartido)."""
    return


def build_elevators_shared():
    g = "ELEVATORS"
    cx = (CORE["minX"] + CORE["maxX"]) / 2
    box(g, "CORE_BLACK", cx, (SLAB_T + ROOF_Y) / 2, 0, CORE_W, ROOF_Y - SLAB_T, CORE_D)  # su cara oeste da al atrio


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


def export_glb(root_name, path, keep=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    objs = descendants(bpy.data.objects[root_name])
    for o in objs:
        if keep is None or keep(o):
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


AR_SCALE = 60   # maqueta 1:60 (~0,63 m de frente) para Scene Viewer; la AR web (nivel A) mide la caja y reescala


def export_ar(path):
    """GLB de AR desde la MISMA fuente (LOD1): sin ventanas nocturnas ni luminarias encendidas (Scene Viewer no tiene
    modo noche y las mostraria como paneles blancos), escala de maqueta en el nodo raiz, Y arriba, base en y = 0."""
    for name, val in (("LIGHT_PANEL", 0.0), ("LED_CROWN", 0.0), ("ELEV_INDICATOR", 1.0)):
        m = MATS.get(name)
        if m:
            next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value = val
    root = bpy.data.objects["BUILDING"]
    keep = lambda o: not (o.type == "MESH" and o.data.materials and o.data.materials[0].name == "WINDOW_NIGHT")
    # Maqueta estatica: una malla por material (pocas draw calls en Scene Viewer). SPC_* y anclas quedan aparte
    # (la AR web los colorea y los toca). Se hace al final: esta escena ya no se vuelve a exportar.
    by_mat = {}
    for o in descendants(root):
        if o.type == "MESH" and keep(o) and not o.name.startswith("SPC_") and o.data.materials:
            by_mat.setdefault(o.data.materials[0].name, []).append(o)
    for mname, objs in by_mat.items():
        if len(objs) > 1:
            with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
                bpy.ops.object.join()
        objs[0].name = f"AR_{mname}"
    root.scale = (1 / AR_SCALE,) * 3
    size = export_glb("BUILDING", path, keep)
    root.scale = (1, 1, 1)
    objs = [o for o in descendants(root) if keep(o) and o.type == "MESH"]
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    return dict(meshes=len(objs), triangles=tris, glb_bytes=size, scale=f"1:{AR_SCALE}")


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
    report["AR"] = export_ar(os.path.join(MODELS, "utp-huancayo-ar.glb"))
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
    ld.angle = math.radians(2.5)   # sol algo difuso: sombras de contacto suaves
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
    rx, ry = RES or (1280, 800)
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = rx, ry, 100
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
        sc.eevee.taa_render_samples = 48
        # Reflejo del vidrio y sombras de contacto suaves (trazado de rayos en pantalla + GI rapido); cada ajuste es opcional.
        for attr, val in (("use_raytracing", True), ("use_shadows", True), ("shadow_ray_count", 2), ("shadow_step_count", 8),
                          ("fast_gi_method", "GLOBAL_ILLUMINATION"), ("fast_gi_ray_count", 4), ("fast_gi_step_count", 8),
                          ("gtao_distance", 1.5)):
            try:
                setattr(sc.eevee, attr, val)
            except Exception as e:
                print("EEVEE_OPT_SKIP", attr, type(e).__name__)
        try:
            sc.eevee.ray_tracing_options.resolution_scale = "1"
            sc.eevee.ray_tracing_options.use_denoise = True
        except Exception as e:
            print("EEVEE_RT_OPT_SKIP", type(e).__name__)
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
    out_dir = _OUT[0] if _OUT else RENDERS
    path = os.path.join(out_dir, name)
    os.makedirs(out_dir, exist_ok=True)
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
    set_camera((-17, 11, 40), (4, 12.5, 0), 40)


def interior_lights():
    """Luz de relleno para vistas interiores: abertura frontal de la seccion + relleno cenital suave sobre el vacio."""
    set_world("day")
    set_world_strength(0.65)
    add_sun(2.2, (1.0, 0.96, 0.9), SUN_DIR)
    add_area((-6, 14, 42), (2, 9, 0), 30, 4200)
    add_area((ATR_X, 33, 0), (ATR_X, 5, 0), 12, 4500, "FILL_TOP")
    set_emission({"LED_CROWN": 0.0, "LIGHT_PANEL": 4.0, "ELEV_INDICATOR": 4.0})


def setup_stairs():
    interior_lights()
    # v3: desde el pasillo de ascensores mirando al oeste: los tramos en zigzag se ven de perfil, como en el video.
    set_camera((ATR["maxX"] + 1.4, base(2) + SLAB_T + 1.6, 1.2), (ATR["minX"], base(4) + 1.0, -0.8), 66)


def setup_elevators():
    interior_lights()
    set_camera((ATR["minX"] - 1.8, base(2) + SLAB_T + 1.6, 2.0), (CORE["minX"], base(3) + 1.6, -0.5), 58)


def setup_floor_p03():
    set_world("day")
    set_world_strength(0.7)
    add_sun(2.6, (1.0, 0.96, 0.9), SUN_DIR)
    set_emission({"LED_CROWN": 0.0, "LIGHT_PANEL": 3.0})
    set_camera(cam_polar(-35, 38, 52, (0, 9.5, 0)), (0, 9.5, 0), 34)


# Vistas con el MISMO punto de vista aproximado que las referencias autenticas (comparacion antes/despues).
# Las fotos y fotogramas no entran al repositorio; solo estos renders propios.
def setup_ref_exterior():
    """Como la foto exterior (vista aerea casi frontal de la fachada principal, algo desde la izquierda)."""
    global RES
    RES = (1000, 1000)
    setup_day()
    target = (2, 17, 0)
    set_camera(cam_polar(-14, 17, 96, target), target, 33)


def setup_ref_elevators():
    """Como la foto del atrio: desde el pasillo oeste de un piso alto, mirando al muro de ascensores al otro lado del vacio."""
    global RES
    RES = (1180, 715)
    interior_lights()
    y = base(6) + SLAB_T + 1.6
    set_camera((ATR["minX"] - 1.5, y, 0.0), (CORE["minX"], base(4) + 1.4, 0.0), 52)


def setup_ref_stairs():
    """Como el fotograma vertical del short: desde un piso bajo mirando hacia arriba el muro de ascensores y las escaleras."""
    global RES
    RES = (720, 1280)
    interior_lights()
    set_camera((ATR["minX"] - 0.15, base(1) + SLAB_T + 1.4, 0.0), (CORE["minX"], base(5) + 1.0, 0.0), 84)


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
    jobs = [
        ("exterior-dia.png", setup_day, None),
        ("exterior-noche.png", setup_night, dict(win_split=True)),
        ("atrio.png", setup_atrium, dict(clip=ATRIUM_CLIP)),
        ("piso-P03-aislado.png", setup_floor_p03, dict(clip=FLOOR_CLIP, extra=floor_ground)),
        ("escaleras.png", setup_stairs, dict(clip=ATRIUM_CLIP)),
        ("ascensores.png", setup_elevators, dict(clip=ATRIUM_CLIP)),
        ("ref-exterior.png", setup_ref_exterior, None),
        ("ref-ascensores.png", setup_ref_elevators, None),
        ("ref-escaleras.png", setup_ref_stairs, None),
    ]
    global RES
    for name, fn, rb in jobs:
        if RENDER_ONLY is None or name in RENDER_ONLY:
            RES = None
            do_render(name, fn, rb)


# --------------------------------------------------------------------------- main
if __name__ == "__main__":
    if not ONLY_RENDER:
        build_and_export()
    if not SKIP_RENDER:
        render_all()
