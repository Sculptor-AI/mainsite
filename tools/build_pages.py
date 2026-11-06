#!/usr/bin/env python3
"""Writes the inner pages, sitemap.xml, robots.txt, llms.txt and 404.html.

Cloudflare Pages serves this repo as is, with no build step, so the output is
committed. After editing anything here, run from the repo root:

    python3 tools/build_pages.py

index.html is hand-written; keep its footer links in step with FOOTER below.
Every claim on these pages should trace to the paper, a README, a model card or
a post. Do not add "tax-deductible" or 501(c)(3) wording until the IRS letter
arrives (see the comment in the footer of index.html). Keep the spoilage method
off the site, and only use weather numbers already published in the Indra-3M and Indra-1.5M model cards.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://sculptorai.org"
UPDATED = "2026-11-06"
ORG = {"@type": ["NGO", "ResearchOrganization"], "@id": f"{SITE}/#organization", "name": "Sculptor AI"}

EMAIL = '<!--email_off--><a href="mailto:contact@sculptorai.org">contact@sculptorai.org</a><!--/email_off-->'

FOOTER = f"""<footer class="site-footer">
        <div class="footer-main">
            <div class="footer-cols">
                <div class="footer-id">
                    <div class="footer-brand">
                        <div class="footer-mark css-art" aria-hidden="true"></div>
                        <span>Sculptor AI</span>
                    </div>
                    <p>Nonprofit research lab building open-source models, tools, and infrastructure.</p>
                    <p class="footer-place">Seattle, WA</p>
                </div>
                <nav class="footer-col" aria-labelledby="footer-research">
                    <h3 id="footer-research">Research</h3>
                    <ul>
                        <li><a href="/research/sunfish/">Sunfish</a></li>
                        <li><a href="/research/brown-dwarf-atmospheres/">Brown Dwarf Atmospheres</a></li>
                        <li><a href="/research/#hyperspectral-spoilage-forecasting">Hyperspectral Spoilage Forecasting</a></li>
                        <li><a href="/research/weather-forecasting/">Weather Forecasting</a></li>
                        <li><a href="/research/autonomous-driving/">Autonomous Driving</a></li>
                    </ul>
                </nav>
                <nav class="footer-col" aria-labelledby="footer-products">
                    <h3 id="footer-products">Products</h3>
                    <ul>
                        <li><a href="/products/constellation/">Constellation</a></li>
                        <li><a href="https://drive.sculptorai.org" rel="noopener">TurnPilot</a></li>
                        <li><a href="/models/">Models</a></li>
                    </ul>
                </nav>
                <nav class="footer-col" aria-labelledby="footer-connect">
                    <h3 id="footer-connect">Connect</h3>
                    <ul>
                        <li><a href="/about/">About</a></li>
                        <li><a href="https://github.com/Sculptor-AI">GitHub</a></li>
                        <li><a href="https://huggingface.co/Sculptor-AI">HuggingFace</a></li>
                        <li>{EMAIL}</li>
                    </ul>
                </nav>
            </div>
            <div class="footer-legal">
                <p>SculptorAI is a charitable nonprofit corporation organized under Washington law. It is not affiliated with
                    Imbue or its Sculptor coding tool.</p>
                <p class="footer-copy">&copy; 2026 SculptorAI. Code and models released under their own open-source
                    licenses.</p>
            </div>
        </div>
    </footer>"""

NAV = [("/about/", "About"), ("/research/", "Research"), ("/models/", "Models")]


def shell(path, title, description, body, crumbs=(), schema=(), status_page=False, shape=0):
    url = f"{SITE}{path}"
    current = ' aria-current="page"'
    nav = "\n".join(
        f'            <a href="{h}"{current if path.startswith(h) else ""}>{t}</a>' for h, t in NAV)
    crumb_html = ""
    graph = list(schema)
    if crumbs:
        trail = [("/", "Sculptor AI")] + list(crumbs)
        links = " / ".join(f'<a href="{h}">{t}</a>' for h, t in trail[:-1])
        crumb_html = f'<p class="fs-path">{links} / {trail[-1][1]}</p>'
        graph.append({
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": t, "item": f"{SITE}{h}"}
                for i, (h, t) in enumerate(trail)],
        })
    ld = ""
    if graph:
        data = json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2, ensure_ascii=False)
        ld = f'\n    <script type="application/ld+json">\n{data}\n    </script>'
    meta = ('<meta name="robots" content="noindex">' if status_page else f"""<link rel="canonical" href="{url}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Sculptor AI">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{SITE}/img/og.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">""")
    shape_attr = f' data-shape="{shape}"' if shape else ""
    return f"""<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/logo.png">
    <title>{title}</title>
    <meta name="description" content="{description}">
    {meta}
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/page.css">{ld}
</head>

<body class="page-body">
    <header class="page-header">
        <a class="page-home" href="/">Sculptor AI</a>
        <nav class="page-nav" aria-label="Main">
{nav}
        </nav>
    </header>
    <main class="fs">
        <div class="ascii-column">
            <pre id="solid-logo-canvas"{shape_attr} aria-hidden="true"></pre>
            <noscript><div class="fs-still css-art"></div></noscript>
        </div>
        <div class="fs-tree">
            {crumb_html}
{body}
        </div>
    </main>
    {FOOTER}
    <script src="/js/ascii-utils.js" defer></script>
    <script src="/js/logo-3d.js" defer></script>
</body>

</html>
"""


def webpage(path, name, description, main_entity=None):
    item = {"@type": "WebPage", "@id": f"{SITE}{path}#webpage", "url": f"{SITE}{path}",
            "name": name, "description": description, "isPartOf": {"@id": f"{SITE}/#website"},
            "publisher": ORG, "dateModified": UPDATED}
    if main_entity:
        item["mainEntity"] = main_entity
    return item


def collection(path, name, description, kind="CollectionPage"):
    return {"@type": kind, "@id": f"{SITE}{path}#webpage", "url": f"{SITE}{path}", "name": name,
            "description": description, "isPartOf": {"@id": f"{SITE}/#website"}, "publisher": ORG,
            "dateModified": UPDATED}


HF = "https://huggingface.co/Sculptor-AI/Indra-3M"
HF15 = "https://huggingface.co/Sculptor-AI/Indra-1.5M"
HF_FAMILY = "https://huggingface.co/collections/Sculptor-AI/indra"
INDRA = [
    {"@type": "SoftwareApplication", "@id": f"{HF}#model", "name": "Indra-3M", "url": HF,
     "applicationCategory": "Weather forecasting model", "operatingSystem": "Any",
     "description": "A tiny, general weather model with 3M parameters, forecasting temperature, dew point, wind, and "
                    "pressure hourly for 72 hours. Trained and tested on airports.", "creator": ORG},
    {"@type": "SoftwareApplication", "@id": f"{HF15}#model", "name": "Indra-1.5M", "url": HF15,
     "applicationCategory": "Weather forecasting model", "operatingSystem": "Any",
     "description": "A tiny, general weather model with 1.5M parameters, forecasting temperature, dew point, wind, and "
                    "pressure hourly for 72 hours. Trained and tested on airports.", "creator": ORG},
]

PAGES = []


# Which shape each page shows, by state number in js/logo-3d.js. About and the 404
# page keep the Sculptor logo (state 0, the default).
SHAPES = {
    "/research/": 1,                          # microscope
    "/research/sunfish/": 2,                  # sunfish
    "/research/brown-dwarf-atmospheres/": 3,  # brown dwarf
    "/research/autonomous-driving/": 5,       # road diorama
    "/models/": 6,                            # rocket
    "/products/constellation/": 7,            # constellation
    "/research/weather-forecasting/": 10,     # cloud
}


def page(path, title, description, body, crumbs=(), schema=()):
    PAGES.append(path)
    (ROOT / path.strip("/")).mkdir(parents=True, exist_ok=True)
    (ROOT / path.strip("/") / "index.html").write_text(
        shell(path, title, description, body, crumbs, schema, shape=SHAPES.get(path, 0)))


# ---------------------------------------------------------------- The tree
def head(title, intro):
    return f'            <h1>{title}</h1>\n            <p class="fs-intro">{intro}</p>\n'


def folder(name, content, long_names=False):
    """A folder of entries (see rows) or of prose and tables (see block)."""
    kind = ' fs-long' if long_names else ''
    return f"""            <details class="fs-folder{kind}" open>
                <summary><h2>{name}</h2></summary>
{content}
            </details>
"""


def rows(*items):
    """Each entry is (name, note), (name, note, href), or (name, note, href, id)."""
    out = []
    for item in items:
        name, note, href, anchor = (tuple(item) + (None, None))[:4]
        label = f'<a href="{href}">{name}</a>' if href else name
        at = f' id="{anchor}"' if anchor else ''
        out.append(f'                    <li{at}><span class="fs-name">{label}</span>'
                   f'<span class="fs-note">{note}</span></li>')
    return "                <ul>\n" + "\n".join(out) + "\n                </ul>"


def block(html):
    return f'                <div class="fs-block">\n{html}\n                </div>'


def table(headers, data):
    """The first column is a label; the rest are numbers, best in the first of them."""
    head_row = "".join(f"<th>{h}</th>" for h in headers)
    body = []
    for line in data:
        cells = [f"<td>{line[0]}</td>"]
        for i, value in enumerate(line[1:]):
            cells.append(f'<td class="num{" best" if i == 0 else ""}">{value}</td>')
        body.append("<tr>" + "".join(cells) + "</tr>")
    return (f'<div class="fs-table"><table><thead><tr>{head_row}</tr></thead>'
            f'<tbody>{"".join(body)}</tbody></table></div>')


# ---------------------------------------------------------------- About
d = ("Sculptor AI is a nonprofit AI research lab in Seattle, Washington, working on diffusion "
     "language models, autonomous driving, and machine learning for science.")
page("/about/", "About | SculptorAI", d,
     head("About Sculptor AI", "Sculptor AI (SculptorAI) is a nonprofit AI research lab based in Seattle, Washington. "
          "We build machine learning models, tools, and infrastructure, and publish the work in the open.")
     + folder("research", rows(
         ("Sunfish", "A coding-first diffusion language model for consumer hardware", "/research/sunfish/"),
         ("Brown dwarf atmospheres", "Calibrated uncertainty for atmospheric retrievals from spectra, on arXiv",
          "/research/brown-dwarf-atmospheres/"),
         ("Hyperspectral spoilage forecasting", "Predicting how many days each individual apple has left",
          "/research/#hyperspectral-spoilage-forecasting"),
         ("Weather forecasting", "Fine-tuned time-series models that correct weather guidance: the Indra family, "
          "whose Indra-3M runs our live Indianapolis forecast, and a separate rain model", "/research/weather-forecasting/"),
         ("Autonomous driving", "TurnPilot, our fork of openpilot, and lightd, its traffic light detector",
          "/research/autonomous-driving/"),
     ), long_names=True)
     + folder("products", rows(
         ("Constellation", "An open-source AI portal, one interface onto many models", "/products/constellation/"),
         ("Models", "The weights we have released, including Indra-3M, Indra-1.5M, Ursa Minor, and lightd", "/models/"),
     ), long_names=True)
     + folder("people", rows(
         ("Chase Culbertson", "CEO, Director", "https://explodingcb.com/"),
         ("Kellen Heraty", "Chief Scientist, Director", "https://kaileh.dev"),
         ("Trisha Choudhary", "CFO", "https://www.linkedin.com/in/trisha-choudhary-/"),
         ("Patrick Graff", "Director"),
     ), long_names=True)
     + folder("organization", rows(
         ("Legal name", "SculptorAI"),
         ("Status", "Charitable nonprofit corporation organized under Washington law (chapter 24.03A RCW)"),
         ("Incorporated", "October 28, 2026"),
         ("First release", "February 2025"),
         ("Location", "Seattle, Washington, USA"),
         ("About the name", "Not affiliated with Imbue, which makes a coding agent tool called Sculptor, or with any "
          "other company that uses the name"),
     ))
     + folder("links", rows(
         ("Code", "github.com/Sculptor-AI", "https://github.com/Sculptor-AI"),
         ("Models", "huggingface.co/Sculptor-AI", "https://huggingface.co/Sculptor-AI"),
         ("Email", EMAIL),
     ))
     + folder("support", rows(
         ("How to help", "The most useful things you can give us are compute, equipment, and time. If you can help, "
          "get in touch."),
     )),
     crumbs=[("/about/", "About")], schema=[{**collection("/about/", "About Sculptor AI", d, "AboutPage"),
                                             "mainEntity": ORG}])

# ---------------------------------------------------------------- Research
d = ("Research from Sculptor AI: diffusion language models, brown dwarf atmosphere retrievals, "
     "hyperspectral spoilage forecasting, weather forecasting, and autonomous driving.")
page("/research/", "Research | SculptorAI", d,
     head("Research", "What Sculptor AI (SculptorAI), a nonprofit AI research lab in Seattle, is working on now.")
     + folder("projects", rows(
         ("Sunfish", "An experimental, coding-first diffusion language model aimed at very low single-user latency "
          "on consumer hardware.", "/research/sunfish/"),
         ("Brown dwarf atmospheres", "Predicting brown dwarf atmospheres from their spectra. Randomizing molecular "
          "opacities during training teaches the network to account for line-list disagreement, lifting coverage of "
          "nominal 90% carbon-to-oxygen intervals from 43% to 82%.", "/research/brown-dwarf-atmospheres/"),
         ("Hyperspectral spoilage forecasting", "Fruit is managed by the batch, but apples from the same crate can "
          "spoil days apart. We're using hyperspectral imaging to forecast how many days each individual apple has "
          "left, and will release the dataset and code.", None, "hyperspectral-spoilage-forecasting"),
         ("Weather forecasting", "Teaching time-series models where the weather models go wrong. Indra is a "
          "family of tiny, general weather models with open weights, at 3M and 1.5M parameters. Indra-3M runs our live "
          "Indianapolis forecast.", "/research/weather-forecasting/"),
         ("Autonomous driving", "TurnPilot, our fork of openpilot, and lightd, a small traffic light detector for "
          "comma cameras.", "/research/autonomous-driving/"),
     ), long_names=True),
     crumbs=[("/research/", "Research")], schema=[collection("/research/", "Research", d)])

# ---------------------------------------------------------------- Brown dwarfs
d = ("Sculptor AI paper on brown dwarf atmospheric retrieval: randomizing molecular opacities in training "
     "lifts coverage of nominal 90% C/O intervals from 43.3% to 82.4%. arXiv:2609.01665.")
TITLE = "Amortized Opacity Marginalization Improves C/O Interval Calibration for Brown-Dwarf Retrievals"
BIB = """@misc{heraty2026opacity,
  title         = {{%s}},
  author        = {Heraty, Kellen},
  year          = {2026},
  eprint        = {2609.01665},
  archivePrefix = {arXiv},
  primaryClass  = {astro-ph.IM}
}""" % TITLE
page("/research/brown-dwarf-atmospheres/", "Brown Dwarf Atmospheres | SculptorAI", d,
     head("Brown dwarf atmospheres", "Molecular line lists disagree enough to shift the carbon-to-oxygen ratio (C/O) "
          "retrieved from a brown dwarf's spectrum. A retrieval that assumes a single list leaves that error out of "
          "its error bars. This paper moves the fix into training, so a neural network returns intervals that already "
          "account for it.")
     + folder("paper", rows(
         ("Title", TITLE),
         ("Author", "Kellen Heraty, Sculptor AI"),
         ("Published", "arXiv:2609.01665 [astro-ph.IM], September 2026, revised October 2026"),
         ("Paper", "arxiv.org/abs/2609.01665", "https://arxiv.org/abs/2609.01665"),
         ("Code (MIT)", "github.com/kaileh57/opacity-marginalization",
          "https://github.com/kaileh57/opacity-marginalization"),
         ("Data (CC BY 4.0)", "huggingface.co/datasets/Kaileh57/opacity-marginalization",
          "https://huggingface.co/datasets/Kaileh57/opacity-marginalization"),
     ))
     + folder("method", block("""                    <p>Classical marginalization reruns a full retrieval under many opacity realizations for every object.
                        Here that cost moves into simulation. While generating the training set, opacities are randomized with
                        smooth multiplicative Fourier fields in log frequency plus a discrete mixture of line lists, under a
                        deliberately broad prior informed by measured differences between lists. A neural posterior estimator
                        trained on that set learns a posterior that is already marginalized.</p>"""))
     + folder("results", block(
         "                    <p>Coverage of nominal 90% C/O intervals, from the paper:</p>\n                    "
         + table(["Test", "Marginalized", "Control"], [
             ["Single network, perturbed held-out spectra (n=2048)", "82.4%", "43.3%"],
             ["Three-seed ensemble, perturbed spectra", "89.4%", "61.4%"],
         ]) + """
                    <p>On clean data the control ensemble reaches 93.2%, which isolates the deficit as opacity-induced.
                        Retraining on the 105 real bad-pixel masks and pooling three seeds returns a nominal 90.5% for C/O and
                        89.1% overall under the full deployment path, still in simulation (n=1024).</p>
                    <p>On 105 JWST/G395H spectral products of 13 late-T and Y dwarfs, single marginalized networks bracket the
                        Hood et al. (2024) T8 benchmark C/O where the control excludes it, at intervals 1.6 to 2.6 times wider.
                        The paper treats this as a consistency check rather than a validation.</p>"""))
     + folder("cite", block(f'                    <pre class="fs-bib">{BIB}</pre>')),
     crumbs=[("/research/", "Research"), ("/research/brown-dwarf-atmospheres/", "Brown Dwarf Atmospheres")], schema=[
         webpage("/research/brown-dwarf-atmospheres/", "Brown dwarf atmospheres", d, {
             "@type": "ScholarlyArticle", "headline": TITLE, "name": TITLE,
             "url": "https://arxiv.org/abs/2609.01665", "sameAs": "https://arxiv.org/abs/2609.01665",
             "identifier": "arXiv:2609.01665", "datePublished": "2026-09-01", "dateModified": "2026-10-05",
             "author": {"@type": "Person", "name": "Kellen Heraty", "url": "https://kaileh.dev",
                        "sameAs": "https://orcid.org/0009-0007-1662-9937", "affiliation": ORG},
             "about": ["brown dwarfs", "atmospheric retrieval", "simulation-based inference", "uncertainty calibration"],
         })])

# ---------------------------------------------------------------- Sunfish
d = ("Sunfish is an experimental, coding-first diffusion language model from Sculptor AI, a pruned derivative "
     "of Google's DiffusionGemma aimed at low latency on an RTX 5080 and Apple Silicon laptops.")
page("/research/sunfish/", "Sunfish | SculptorAI", d,
     head("Sunfish", "Sunfish is an experimental, coding-first diffusion language model from Sculptor AI, aimed at very "
          "low single-user latency on consumer hardware.")
     + folder("status", rows(
         ("Stage", "In development. No weights have been released yet."),
         ("Primary target", "RTX 5080 with 16 GB of memory"),
         ("Secondary target", "24 GB Apple Silicon laptop"),
         ("Code", "github.com/Sculptor-AI/Sunfish", "https://github.com/Sculptor-AI/Sunfish"),
     ))
     + folder("design", rows(
         ("Base", "A text-only, structurally pruned derivative of Google's DiffusionGemma architecture"),
         ("Experts per layer", "128 reduced to 32, keeping the always-active shared expert"),
         ("Routing", "4 experts per token initially, down from 8"),
         ("Vision tower", "Removed for the coding and agentic target"),
         ("Parameters", "8,114,384,892 total, 3,118,575,612 active (audited against the released shard headers)"),
     ))
     + folder("why-pruning", block("""                    <p>Starting from a small autoregressive model would mean teaching it the diffusion objective,
                        bidirectional denoising, self-conditioning, and prefill behavior from nothing. Pruning lets Sunfish inherit
                        those behaviors from a model that is already trained, and makes expert selection and recovery training the
                        main research problem.</p>"""))
     + folder("first-gates", block("""                    <p>The project does not spend on a large training run until the checkpoint transformation is lossless on a
                        no-prune control and zero-shot pruning data supports a specific candidate. The first gates are to reproduce
                        the upstream 4-bit model on the target hardware, instrument router use across coding, agentic, and general
                        prompts, and run a controlled pruning ablation measuring quality, memory, and latency at each step.</p>""")),
     crumbs=[("/research/", "Research"), ("/research/sunfish/", "Sunfish")], schema=[
         webpage("/research/sunfish/", "Sunfish", d, {
             "@type": "SoftwareSourceCode", "name": "Sunfish", "description": d,
             "codeRepository": "https://github.com/Sculptor-AI/Sunfish", "programmingLanguage": "Python",
             "creator": ORG, "creativeWorkStatus": "In development"})])

# ---------------------------------------------------------------- Weather
d = ("Sculptor AI's weather forecasting: Indra, a family of tiny, general open weather models (Indra-3M and "
     "Indra-1.5M) fine-tuned from Mistral's Timestral, and our live Indianapolis forecast, which runs Indra-3M.")
FRESH_NOTE = ("These six weren't completely untouched: we had used them to check earlier models, and a 5.2M version from "
              "this same work had already been scored on this period. So before scoring, we also wrote down 12 other "
              "airports that no model in this project had trained on, been tuned on, or been checked against, and scored "
              "them once over the same year, with 240 forecasts each.")


def indra_folder(name, params, file_mb, card, extra=()):
    return folder(name, rows(
        ("What it is", f"A {file_mb} MB model that forecasts temperature, dew point, wind, and pressure for each of the "
         "next 72 hours at a station, with an 80% range around each forecast"),
        ("Size", f"{params} parameters"),
        *extra,
        ("Base", "Pruned and fine-tuned from Timestral-5M by Mistral AI"),
        ("Inputs", "A station's last 90 days of observations, plus US forecast guidance: the National Blend of Models, "
         "GFS MOS, and NAM MOS. The script reads airport data so far."),
        ("License", "Modified MIT, the same as Timestral, with Mistral AI's attribution notice and a condition on "
         "companies with more than $20 million in monthly revenue"),
        ("Not for", "Safety decisions, including aviation and emergencies. It's a research model."),
        ("Weights and card", f"huggingface.co/Sculptor-AI/{name}", card),
    ))


def six_table(name, data):
    return table(["Airport", name, "National Blend", "Improvement"], [
        [airport, f"{m}&deg;F", f"{blend}&deg;F", f"{imp}%"] for airport, m, blend, imp in data])


SIX3 = [("Columbus (CMH)", "2.04", "2.27", "10.2"), ("Chicago O'Hare (ORD)", "2.08", "2.31", "10.2"),
        ("Denver (DEN)", "2.79", "3.29", "15.4"), ("Miami (MIA)", "1.42", "1.59", "10.3"),
        ("Seattle (SEA)", "1.61", "1.79", "9.7"), ("Phoenix (PHX)", "1.70", "2.03", "15.9")]
SIX15 = [("Columbus (CMH)", "2.05", "2.27", "9.6"), ("Chicago O'Hare (ORD)", "2.09", "2.31", "9.7"),
         ("Denver (DEN)", "2.83", "3.29", "13.9"), ("Miami (MIA)", "1.44", "1.59", "9.0"),
         ("Seattle (SEA)", "1.64", "1.79", "8.6"), ("Phoenix (PHX)", "1.73", "2.03", "14.5")]
RECORD_INTRO = ("                    <p>Average temperature error, 1 to 72 hours ahead, over November 2025 to October 2026, "
                "at six airports it never trained on. Scored once on the locked model. Lower is better.</p>\n"
                "                    ")

page("/research/weather-forecasting/", "Weather Forecasting | SculptorAI", d,
     head("Weather forecasting", "We fine-tune time-series models to learn where the professional weather models go "
          f'wrong. Indra is a family of tiny, general weather models with open weights: <a href="{HF}">Indra-3M</a> and '
          f'<a href="{HF15}">Indra-1.5M</a>. Indra-3M runs '
          '<a href="https://weather.explodingcb.com">our live Indianapolis forecast</a>, an hourly forecast for '
          "Indianapolis International Airport (KIND).")
     + folder("what has been measured", block(
         "                    <p>Airports are what Indra was trained and tested on, because they have the long, reliable "
         "records and guidance archives that training and scoring need. They are not its purpose. Every score on this "
         "page comes from an airport, and nothing else has been measured. Indra depends on US forecast guidance, and the "
         "script only reads airport data so far. A station away from an airport would have to use a nearby airport's "
         "guidance, and we haven't measured how it does there.</p>")
         + "\n" + rows(("Indra family", "Indra on Hugging Face", HF_FAMILY)))
     + indra_folder("Indra-3M", "2,999,627", 12, HF)
     + indra_folder("Indra-1.5M", "1,500,874", 6, HF15, extra=(
         ("Next to Indra-3M", "Half the size, with 1.2% more temperature error on the final test"),))
     + folder("Indra-3M record", block(
         RECORD_INTRO + six_table("Indra-3M", SIX3) + f"""
                    <p>{FRESH_NOTE} Across all 12, its temperature error was 11.7% lower than the National Blend overall, and
                        3.7% to 15.4% lower by airport.</p>"""))
     + folder("Indra-1.5M record", block(
         RECORD_INTRO + six_table("Indra-1.5M", SIX15) + f"""
                    <p>{FRESH_NOTE} Across all 12, its temperature error was 10.3% lower than the National Blend overall, and
                        2.1% to 15.0% lower by airport. At Buffalo (BUF), its gain is too small to tell from chance.</p>"""))
     + folder("live forecast", rows(
         ("Temperature, dew point, wind, pressure", "Indra-3M"),
         ("Rain", "A separate model, fine-tuned from Timestral-5M, which also reads the HRRR"),
         ("Site", "weather.explodingcb.com", "https://weather.explodingcb.com"),
     ))
     + folder("Indianapolis temperature record", block(
         "                    <p>Average temperature error of Indra-3M at Indianapolis (KIND), November 2025 to October 2026, in "
         "&deg;F. All three forecasts are scored on identical hours against what the station measured. Indra-3M trained on "
         "Indianapolis through October 2024, but not on this test year. Lower is better.</p>\n                    "
         + table(["Hours ahead", "Indra-3M", "National Blend", "NWS"], [
             ["1 to 6", "1.29", "1.84", "1.97"], ["7 to 12", "1.64", "1.94", "2.19"],
             ["13 to 24", "1.80", "2.12", "2.39"], ["25 to 36", "2.03", "2.28", "2.59"],
             ["37 to 48", "2.22", "2.47", "2.77"], ["49 to 72", "2.41", "2.67", "2.96"],
         ])))
     + folder("Indianapolis rain record", block(
         "                    <p>Brier score for the chance of at least 0.01 inches of rain or melted snow in an hour, over the same year. "
         "Lower is better.</p>\n                    "
         + table(["Hours ahead", "Live forecast", "Blend, 6 h chance scaled to one hour", "HRRR, rain or no rain"], [
             ["1 to 12", "0.029", "0.037", "0.045"], ["13 to 24", "0.033", "0.038", "0.057"],
             ["25 to 48", "0.036", "0.040", "0.065"], ["49 to 72", "0.041", "0.042", "no data"],
         ]))),
     crumbs=[("/research/", "Research"), ("/research/weather-forecasting/", "Weather Forecasting")], schema=[
         webpage("/research/weather-forecasting/", "Weather forecasting", d, {
             "@type": "WebApplication", "name": "Indianapolis weather forecast", "description": d, "url": "https://weather.explodingcb.com",
             "applicationCategory": "Weather forecast", "operatingSystem": "Web", "creator": ORG}), *INDRA])

# ---------------------------------------------------------------- Driving
d = ("Sculptor AI's autonomous driving research: TurnPilot, a fork of openpilot that took third at COMMA_HACK 7, "
     "and lightd v4, a 3.7M-parameter traffic light detector for comma cameras.")
page("/research/autonomous-driving/", "Autonomous Driving | SculptorAI", d,
     head("Autonomous driving", "Sculptor AI researches perception and planning for autonomous vehicles, from simulation "
          "to small-scale test platforms. Our main project is TurnPilot, a fork of openpilot with navigation and traffic "
          "light handling. TurnPilot is coming soon.")
     + folder("turnpilot", rows(
         ("Site", "drive.sculptorai.org", "https://drive.sculptorai.org"),
         ("COMMA_HACK 7", "Third place, September 2026. Chase Culbertson and Kellen Heraty brought back Navigate on "
          "openpilot, which comma turned off in 2024, inside BeamNG.drive."),
         ("Setup", "BeamNG supplied the graphics and physics, while everything that decided what the car did ran on a "
          "real comma four with comma's chestnut external GPU"),
         ("Inputs", "openpilot received only the camera, the car's CAN data, GPS, and a map, as it would in a real car"),
         ("Post", "We built Navigate on openpilot in a video game", "https://drive.sculptorai.org/log/0/"),
     ))
     + folder("lightd-v4", rows(
         ("What it is", "A small traffic light detector for comma cameras that finds lights in a forward camera image "
          "and reads their color and arrow shape"),
         ("Scope", "Validated for clear daytime driving only. Night, precipitation, and other cameras are not validated."),
         ("Architecture", "EfficientNet-B0 CenterNet, distilled from a ConvNeXt-T teacher"),
         ("Size", "3.7M parameters, 8.7 GFLOPs, ONNX"),
         ("AP", "0.898 on a hand-labeled comma10k test set (240 frames, 445 lights), 0.856 on LISA, Bosch, and S2TLD "
          "test splits"),
         ("Color", "100% correct on detected lights in that comma test, with no red read as green"),
         ("License", "CC BY-NC-SA 4.0, non-commercial"),
         ("Weights", "huggingface.co/Sculptor-AI/lightd-v4", "https://huggingface.co/Sculptor-AI/lightd-v4"),
         ("Post", "Getting lightd out of the video game", "https://drive.sculptorai.org/log/1/"),
     )),
     crumbs=[("/research/", "Research"), ("/research/autonomous-driving/", "Autonomous Driving")], schema=[
         webpage("/research/autonomous-driving/", "Autonomous driving", d)])

# ---------------------------------------------------------------- Models
d = ("Open model weights released by Sculptor AI on Hugging Face: the Indra-3M and Indra-1.5M weather models, "
     "Ursa Minor, Ursa Minor Smashed, and the lightd v4 traffic light detector.")
page("/models/", "Models | SculptorAI", d,
     head("Models", 'The model weights Sculptor AI has released, all on '
          '<a href="https://huggingface.co/Sculptor-AI">Hugging Face</a>.')
     + folder("Indra-3M", rows(
         ("What it is", "A tiny, general weather model: temperature, dew point, wind, and pressure, hourly for 72 hours. "
          "Trained and tested on airports.", "/research/weather-forecasting/"),
         ("Size", "2,999,627 parameters, 12 MB"),
         ("License", "Modified MIT, the same as Timestral"),
         ("Weights", "Sculptor-AI/Indra-3M", HF),
         ("Family", "Indra on Hugging Face", HF_FAMILY),
     ))
     + folder("Indra-1.5M", rows(
         ("What it is", "The smaller Indra: the same inputs and outputs as Indra-3M at half the size. Trained and tested "
          "on airports.", "/research/weather-forecasting/"),
         ("Size", "1,500,874 parameters, 6 MB"),
         ("License", "Modified MIT, the same as Timestral"),
         ("Weights", "Sculptor-AI/Indra-1.5M", HF15),
         ("Family", "Indra on Hugging Face", HF_FAMILY),
     ))
     + folder("Ursa Minor", rows(
         ("What it is", "A reasoning-focused language model built on Qwen2.5-7B-Instruct"),
         ("Size", "7.6B parameters"),
         ("Weights", "Sculptor-AI/Ursa_Minor", "https://huggingface.co/Sculptor-AI/Ursa_Minor"),
         ("GGUF (Apache-2.0)", "Sculptor-AI/Ursa_Minor-GGUF", "https://huggingface.co/Sculptor-AI/Ursa_Minor-GGUF"),
     ))
     + folder("Ursa Minor Smashed", rows(
         ("What it is", "A GPT-2 small reproduction trained from scratch on FineWeb-edu with a modern training recipe"),
         ("Size", "124M parameters"),
         ("License", "MIT"),
         ("Weights", "Sculptor-AI/Ursa_Minor_Smashed", "https://huggingface.co/Sculptor-AI/Ursa_Minor_Smashed"),
     ))
     + folder("lightd v4", rows(
         ("What it is", "A traffic light detector for comma cameras", "/research/autonomous-driving/"),
         ("Size", "3.7M parameters"),
         ("License", "CC BY-NC-SA 4.0"),
         ("Weights", "Sculptor-AI/lightd-v4", "https://huggingface.co/Sculptor-AI/lightd-v4"),
     ))
     + folder("in development", rows(
         ("Sunfish", "Our diffusion language model", "/research/sunfish/"),
     )),
     crumbs=[("/models/", "Models")], schema=[collection("/models/", "Models", d), *INDRA])

# ---------------------------------------------------------------- Constellation
d = ("Constellation is Sculptor AI's open-source AI portal: one interface onto models from Anthropic, OpenAI, Google, "
     "Meta, and NVIDIA, with web search, image generation, and creative tools. MIT licensed.")
page("/products/constellation/", "Constellation | SculptorAI", d,
     head("Constellation", "Constellation is an open-source AI portal from Sculptor AI: one interface onto many models.")
     + folder("overview", rows(
         ("Open it", "ai.sculptorai.org", "https://ai.sculptorai.org"),
         ("Code (MIT)", "github.com/Sculptor-AI/aiportal", "https://github.com/Sculptor-AI/aiportal"),
         ("Models", "Anthropic, OpenAI, Google, Meta, NVIDIA, and custom backend models"),
         ("Runs as", "A progressive web app you can install on any device"),
     ))
     + folder("features", rows(
         ("Research", "Thinking mode, web search, and a deep research mode that combines multiple sources"),
         ("Images", "Image generation from text prompts"),
         ("Tools", "Whiteboard, graphing calculator, LaTeX equation editor, flowchart builder, and a 3D sandbox"),
         ("Files", "Images, PDFs, and text files in chat"),
         ("News", "A news hub with an RSS reader and AI summaries"),
     )),
     crumbs=[("/products/constellation/", "Constellation")], schema=[
         webpage("/products/constellation/", "Constellation", d, {
             "@type": "WebApplication", "name": "Constellation", "description": d, "url": "https://ai.sculptorai.org",
             "applicationCategory": "AI portal", "operatingSystem": "Web",
             "license": "https://opensource.org/license/mit", "creator": ORG,
             "sameAs": "https://github.com/Sculptor-AI/aiportal"})])

# ---------------------------------------------------------------- Plain files
(ROOT / "404.html").write_text(shell(
    "/404", "Page not found | SculptorAI", "This page does not exist.",
    head("Page not found", 'That address doesn\'t lead anywhere. Try the <a href="/">homepage</a> or the '
         '<a href="/research/">research</a> page.'), status_page=True))

urls = ["/"] + PAGES
(ROOT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}{u}</loc><lastmod>{UPDATED}</lastmod></url>\n" for u in urls)
    + "</urlset>\n")

(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

(ROOT / "llms.txt").write_text(f"""# Sculptor AI

> Sculptor AI (SculptorAI) is a nonprofit AI research lab based in Seattle, Washington. It builds machine learning models, tools, and infrastructure, and publishes the work in the open. It is not affiliated with Imbue, which makes a coding agent tool called Sculptor.

## Lab

- [About]({SITE}/about/): what the lab is, its people, and its legal status

## Research

- [Research overview]({SITE}/research/): all current projects
- [Sunfish]({SITE}/research/sunfish/): an experimental, coding-first diffusion language model
- [Brown dwarf atmospheres]({SITE}/research/brown-dwarf-atmospheres/): calibrated C/O intervals under line-list uncertainty (arXiv:2609.01665)
- [Weather forecasting]({SITE}/research/weather-forecasting/): Indra, a family of tiny, general open weather models (Indra-3M and Indra-1.5M, trained and tested on airports, with every score from an airport). Indra-3M runs our live Indianapolis forecast. Track records at six final-test airports, 12 fresh airports and Indianapolis
- [Autonomous driving]({SITE}/research/autonomous-driving/): TurnPilot, a fork of openpilot, and lightd, a traffic light detector

## Releases

- [Models]({SITE}/models/): Indra-3M, Indra-1.5M, Ursa Minor, Ursa Minor Smashed, lightd v4
- [Constellation]({SITE}/products/constellation/): an open-source AI portal
- [GitHub](https://github.com/Sculptor-AI)
- [Hugging Face](https://huggingface.co/Sculptor-AI)
- [Indra on Hugging Face](https://huggingface.co/collections/Sculptor-AI/indra)
""")
print("\n".join(urls))
