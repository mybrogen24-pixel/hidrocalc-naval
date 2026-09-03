"""Camada mínima de hospedagem do frontend HidroCalc Naval no Streamlit."""

from __future__ import annotations

import base64
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).resolve().parent

CSS_FILES = (
    "styles.css",
    "editor.css",
    "enhancements.css",
    "redesign.css",
    "visualizer.css",
)

# O importador XLSX precisa do Pako antes de ser inicializado. O aplicativo
# principal, por sua vez, depende do viewer e do importador já disponíveis.
JAVASCRIPT_FILES = (
    "vendor/pako_inflate.min.js",
    "viewer3d.js",
    "offset-importer.js",
    "app.js",
)

DOWNLOAD_FILES = (
    "data/exemplo_cotas.csv",
    "data/exemplo_cotas_matriz.csv",
    "data/teste_quilha_variavel.csv",
)

LINK_TAG = re.compile(r"<link\b[^>]*\bhref\s*=\s*(['\"])([^'\"]+)\1[^>]*>", re.IGNORECASE)
SCRIPT_TAG = re.compile(
    r"<script\b(?=[^>]*\bsrc\s*=\s*(['\"])([^'\"]+)\1)[^>]*>\s*</script\s*>",
    re.IGNORECASE,
)


def read_text(relative_path: str) -> str:
    """Lê um recurso versionado a partir da raiz do repositório."""

    path = ROOT / relative_path
    if not path.is_file():
        raise FileNotFoundError(f"Arquivo necessário não encontrado: {relative_path}")
    return path.read_text(encoding="utf-8")


def normalized_reference(reference: str) -> str:
    """Remove query string e prefixos relativos para comparar assets locais."""

    return reference.split("?", 1)[0].split("#", 1)[0].replace("\\", "/").removeprefix("./")


def remove_embedded_asset_tags(document: str) -> str:
    """Remove apenas tags dos CSS/JS que serão incorporados abaixo."""

    css_names = set(CSS_FILES)
    script_names = set(JAVASCRIPT_FILES)

    def replace_link(match: re.Match[str]) -> str:
        return "" if normalized_reference(match.group(2)) in css_names else match.group(0)

    def replace_script(match: re.Match[str]) -> str:
        return "" if normalized_reference(match.group(2)) in script_names else match.group(0)

    return SCRIPT_TAG.sub(replace_script, LINK_TAG.sub(replace_link, document))


def embed_downloads(document: str) -> str:
    """Converte os modelos CSV locais em data URLs autossuficientes."""

    for relative_path in DOWNLOAD_FILES:
        path = ROOT / relative_path
        if not path.is_file():
            raise FileNotFoundError(f"Modelo para download não encontrado: {relative_path}")
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        data_url = f"data:text/csv;charset=utf-8;base64,{encoded}"
        document = document.replace(f'href="{relative_path}"', f'href="{data_url}"')
        document = document.replace(f"href='{relative_path}'", f"href='{data_url}'")
    return document


def safe_inline_script(source: str) -> str:
    """Evita que uma sequência textual feche antecipadamente a tag HTML."""

    return source.replace("</script", "<\\/script")


def build_frontend_document() -> str:
    """Monta um único documento HTML sem requisições a assets locais."""

    document = remove_embedded_asset_tags(read_text("index.html"))
    document = embed_downloads(document)

    styles = "\n".join(
        f"/* Fonte incorporada: {name} */\n{read_text(name)}" for name in CSS_FILES
    )
    scripts = "\n".join(
        f'<script data-inline-source="{name}">\n'
        f"{safe_inline_script(read_text(name))}\n"
        f"//# sourceURL={name}\n"
        "</script>"
        for name in JAVASCRIPT_FILES
    )

    document, head_count = re.subn(
        r"</head\s*>",
        lambda _: f'<style id="hidrocalc-inline-css">\n{styles}\n</style>\n</head>',
        document,
        count=1,
        flags=re.IGNORECASE,
    )
    document, body_count = re.subn(
        r"</body\s*>",
        lambda _: f"{scripts}\n</body>",
        document,
        count=1,
        flags=re.IGNORECASE,
    )
    if head_count != 1 or body_count != 1:
        raise ValueError("index.html precisa conter exatamente um fechamento de head e body.")

    unresolved = [
        name
        for name in (*CSS_FILES, *JAVASCRIPT_FILES, *DOWNLOAD_FILES)
        if f'href="{name}"' in document or f'src="{name}"' in document
    ]
    if unresolved:
        raise ValueError("Assets locais não incorporados: " + ", ".join(unresolved))
    return document


st.set_page_config(
    page_title="HidroCalc Naval",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      #MainMenu, [data-testid="stHeader"], [data-testid="stToolbar"],
      [data-testid="stDecoration"], footer { display: none !important; }
      [data-testid="stAppViewContainer"], [data-testid="stMain"] {
        background: #050b14;
      }
      .stMainBlockContainer, .block-container {
        width: 100% !important;
        max-width: none !important;
        padding: 0 !important;
      }
      [data-testid="stIFrame"], iframe[title="streamlit.components.v1.html"] {
        display: block;
        width: 100%;
        border: 0;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

try:
    frontend_document = build_frontend_document()
except (OSError, ValueError) as error:
    st.error(f"Não foi possível montar o frontend do HidroCalc: {error}")
    st.stop()

if hasattr(st, "iframe"):
    st.iframe(frontend_document, width="stretch", height=1500)
else:
    # Compatibilidade com versões anteriores do Streamlit.
    components.html(frontend_document, height=1500, scrolling=True)
