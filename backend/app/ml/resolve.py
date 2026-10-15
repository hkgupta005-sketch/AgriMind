"""Turn what a farmer types into a valid model option: case, short forms (UP), Hindi crop
names (aloo), part of a name and small spelling mistakes. Mirrors the matching rules of the
command-line versions of the AgriMind predict scripts."""

import difflib

STATE_SHORT = {
    "up": "Uttar Pradesh", "mp": "Madhya Pradesh", "hp": "Himachal Pradesh",
    "ap": "Andhra Pradesh", "wb": "West Bengal", "tn": "Tamil Nadu",
    "jk": "Jammu and Kashmir", "j&k": "Jammu and Kashmir", "uk": "Uttarakhand",
    "bengal": "West Bengal", "orissa": "Odisha", "pondicherry": "Puducherry",
}

# Everyday / Hindi names -> names used in the mandi data (from predict_price.py)
MANDI_NAMES = {
    "aloo": "Potato", "alu": "Potato", "pyaz": "Onion", "pyaj": "Onion", "kanda": "Onion",
    "tamatar": "Tomato", "gehun": "Wheat", "gehu": "Wheat", "dhan": "Paddy(Dhan)(Common)",
    "paddy": "Paddy(Dhan)(Common)", "makka": "Maize", "makai": "Maize", "sarson": "Mustard",
    "sarso": "Mustard", "chana": "Bengal Gram(Gram)(Whole)", "baingan": "Brinjal",
    "gobhi": "Cauliflower", "phool gobhi": "Cauliflower", "patta gobhi": "Cabbage",
    "mirch": "Green Chilli", "hari mirch": "Green Chilli", "lehsun": "Garlic", "lahsun": "Garlic",
    "adrak": "Ginger(Green)", "kela": "Banana", "aam": "Mango", "nimbu": "Lemon",
    "kapas": "Cotton", "lauki": "Bottle gourd", "karela": "Bitter gourd", "gajar": "Carrot",
    "mooli": "Raddish", "matar": "Peas Wet", "palak": "Spinach", "seb": "Apple",
}

# Hindi names -> names in the district crop production data
PRODUCTION_NAMES = {
    "dhan": "Rice", "chawal": "Rice", "paddy": "Rice", "gehun": "Wheat", "gehu": "Wheat",
    "makka": "Maize", "makai": "Maize", "aloo": "Potato", "alu": "Potato", "pyaz": "Onion",
    "ganna": "Sugarcane", "sarson": "Rapeseed &Mustard", "chana": "Gram", "arhar": "Arhar/Tur",
    "tur": "Arhar/Tur", "bajra": "Bajra", "jowar": "Jowar", "kapas": "Cotton(lint)",
    "moong": "Moong(Green Gram)", "urad": "Urad", "masoor": "Masoor", "jau": "Barley",
}


def resolve(text, valid, aliases=None):
    """Return {match, suggestions, how}. match is None when unsure."""
    valid = sorted({str(v) for v in valid})
    lookup = {v.lower(): v for v in valid}
    t = str(text or "").strip().lower()
    if not t:
        return {"match": None, "suggestions": valid[:8], "how": None}

    if t in lookup:
        return {"match": lookup[t], "suggestions": [], "how": "exact"}

    if aliases and t in aliases and aliases[t] in valid:
        return {"match": aliases[t], "suggestions": [], "how": "alias"}
    if aliases and t in aliases:  # alias known but spelled differently in this list
        found = lookup.get(aliases[t].lower())
        if found:
            return {"match": found, "suggestions": [], "how": "alias"}

    if len(t) >= 3:
        starts = [v for v in valid if v.lower().startswith(t)]
        if len(starts) == 1:
            return {"match": starts[0], "suggestions": [], "how": "prefix"}
        inside = [v for v in valid if t in v.lower()]
        if len(inside) == 1 and not starts:
            return {"match": inside[0], "suggestions": [], "how": "contains"}
        if starts or inside:
            return {"match": None, "suggestions": (starts or inside)[:8], "how": None}

    scored = sorted(((difflib.SequenceMatcher(None, t, k).ratio(), lookup[k]) for k in lookup), reverse=True)
    if scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.05):
        return {"match": scored[0][1], "suggestions": [], "how": "spelling"}
    return {"match": None, "suggestions": [name for score, name in scored[:6] if score >= 0.45], "how": None}


def must(text, valid, label, aliases=None):
    """Resolve or raise ValueError with suggestions (shown to the user as a 400)."""
    r = resolve(text, valid, aliases)
    if r["match"]:
        return r["match"]
    hint = f" Did you mean: {', '.join(r['suggestions'][:5])}?" if r["suggestions"] else ""
    raise ValueError(f"{label} '{text}' was not found in the model's data.{hint}")
