// Von docs/entwurf-figuren/bildtafel.py erzeugt – nicht von Hand ändern.
// Figuren und Bühnenbilder für Blöckly (Paket 18b); Bilder in assets/graphics/gsg-figuren.png.

/** Kostüm einer Figur: Kennung (Richtung-Pose) und Anzeigename; Nummer = Stelle in der Liste */
export type GsgKostuem = { id: string; titel: string };
/** name = Name in Java (SpriteLibrary.<name>) */
export type GsgFigur = { name: string; titel: string; beschreibung: string; kostueme: GsgKostuem[] };

export const GSG_FIGUREN: GsgFigur[] = [
    {
        "name": "Waschbaer",
        "titel": "Waschbär",
        "beschreibung": "neugierig, mutig, sammelt alles, was glänzt",
        "kostueme": [
            {
                "id": "vorne-stehen",
                "titel": "vorne stehen"
            },
            {
                "id": "vorne-laufen1",
                "titel": "vorne laufen 1"
            },
            {
                "id": "vorne-laufen2",
                "titel": "vorne laufen 2"
            },
            {
                "id": "vorne-winken",
                "titel": "vorne winken"
            },
            {
                "id": "rechts-stehen",
                "titel": "rechts stehen"
            },
            {
                "id": "rechts-laufen1",
                "titel": "rechts laufen 1"
            },
            {
                "id": "rechts-laufen2",
                "titel": "rechts laufen 2"
            },
            {
                "id": "rechts-laufen3",
                "titel": "rechts laufen 3"
            },
            {
                "id": "rechts-laufen4",
                "titel": "rechts laufen 4"
            },
            {
                "id": "links-stehen",
                "titel": "links stehen"
            },
            {
                "id": "links-laufen1",
                "titel": "links laufen 1"
            },
            {
                "id": "links-laufen2",
                "titel": "links laufen 2"
            },
            {
                "id": "links-laufen3",
                "titel": "links laufen 3"
            },
            {
                "id": "links-laufen4",
                "titel": "links laufen 4"
            },
            {
                "id": "hinten-stehen",
                "titel": "hinten stehen"
            },
            {
                "id": "hinten-laufen1",
                "titel": "hinten laufen 1"
            },
            {
                "id": "hinten-laufen2",
                "titel": "hinten laufen 2"
            }
        ]
    },
    {
        "name": "RoterPanda",
        "titel": "Roter Panda",
        "beschreibung": "gemütlich, klettert gern, liebt Bambus",
        "kostueme": [
            {
                "id": "vorne-stehen",
                "titel": "vorne stehen"
            },
            {
                "id": "vorne-laufen1",
                "titel": "vorne laufen 1"
            },
            {
                "id": "vorne-laufen2",
                "titel": "vorne laufen 2"
            },
            {
                "id": "vorne-winken",
                "titel": "vorne winken"
            },
            {
                "id": "rechts-stehen",
                "titel": "rechts stehen"
            },
            {
                "id": "rechts-laufen1",
                "titel": "rechts laufen 1"
            },
            {
                "id": "rechts-laufen2",
                "titel": "rechts laufen 2"
            },
            {
                "id": "rechts-laufen3",
                "titel": "rechts laufen 3"
            },
            {
                "id": "rechts-laufen4",
                "titel": "rechts laufen 4"
            },
            {
                "id": "links-stehen",
                "titel": "links stehen"
            },
            {
                "id": "links-laufen1",
                "titel": "links laufen 1"
            },
            {
                "id": "links-laufen2",
                "titel": "links laufen 2"
            },
            {
                "id": "links-laufen3",
                "titel": "links laufen 3"
            },
            {
                "id": "links-laufen4",
                "titel": "links laufen 4"
            },
            {
                "id": "hinten-stehen",
                "titel": "hinten stehen"
            },
            {
                "id": "hinten-laufen1",
                "titel": "hinten laufen 1"
            },
            {
                "id": "hinten-laufen2",
                "titel": "hinten laufen 2"
            }
        ]
    },
    {
        "name": "Roboter",
        "titel": "Roboter",
        "beschreibung": "hilfsbereit, rechnet schnell, in den Schulfarben",
        "kostueme": [
            {
                "id": "vorne-stehen",
                "titel": "vorne stehen"
            },
            {
                "id": "vorne-laufen1",
                "titel": "vorne laufen 1"
            },
            {
                "id": "vorne-laufen2",
                "titel": "vorne laufen 2"
            },
            {
                "id": "vorne-winken",
                "titel": "vorne winken"
            },
            {
                "id": "rechts-stehen",
                "titel": "rechts stehen"
            },
            {
                "id": "rechts-laufen1",
                "titel": "rechts laufen 1"
            },
            {
                "id": "rechts-laufen2",
                "titel": "rechts laufen 2"
            },
            {
                "id": "rechts-laufen3",
                "titel": "rechts laufen 3"
            },
            {
                "id": "rechts-laufen4",
                "titel": "rechts laufen 4"
            },
            {
                "id": "links-stehen",
                "titel": "links stehen"
            },
            {
                "id": "links-laufen1",
                "titel": "links laufen 1"
            },
            {
                "id": "links-laufen2",
                "titel": "links laufen 2"
            },
            {
                "id": "links-laufen3",
                "titel": "links laufen 3"
            },
            {
                "id": "links-laufen4",
                "titel": "links laufen 4"
            },
            {
                "id": "hinten-stehen",
                "titel": "hinten stehen"
            },
            {
                "id": "hinten-laufen1",
                "titel": "hinten laufen 1"
            },
            {
                "id": "hinten-laufen2",
                "titel": "hinten laufen 2"
            }
        ]
    },
    {
        "name": "Axolotl",
        "titel": "Axolotl",
        "beschreibung": "lächelt immer, schwimmt gern, gibt nie auf",
        "kostueme": [
            {
                "id": "vorne-stehen",
                "titel": "vorne stehen"
            },
            {
                "id": "vorne-laufen1",
                "titel": "vorne laufen 1"
            },
            {
                "id": "vorne-laufen2",
                "titel": "vorne laufen 2"
            },
            {
                "id": "vorne-winken",
                "titel": "vorne winken"
            },
            {
                "id": "rechts-stehen",
                "titel": "rechts stehen"
            },
            {
                "id": "rechts-laufen1",
                "titel": "rechts laufen 1"
            },
            {
                "id": "rechts-laufen2",
                "titel": "rechts laufen 2"
            },
            {
                "id": "rechts-laufen3",
                "titel": "rechts laufen 3"
            },
            {
                "id": "rechts-laufen4",
                "titel": "rechts laufen 4"
            },
            {
                "id": "links-stehen",
                "titel": "links stehen"
            },
            {
                "id": "links-laufen1",
                "titel": "links laufen 1"
            },
            {
                "id": "links-laufen2",
                "titel": "links laufen 2"
            },
            {
                "id": "links-laufen3",
                "titel": "links laufen 3"
            },
            {
                "id": "links-laufen4",
                "titel": "links laufen 4"
            },
            {
                "id": "hinten-stehen",
                "titel": "hinten stehen"
            },
            {
                "id": "hinten-laufen1",
                "titel": "hinten laufen 1"
            },
            {
                "id": "hinten-laufen2",
                "titel": "hinten laufen 2"
            }
        ]
    },
    {
        "name": "Pinguin",
        "titel": "Pinguin",
        "beschreibung": "watschelt, rutscht gern, trägt immer Schal",
        "kostueme": [
            {
                "id": "vorne-stehen",
                "titel": "vorne stehen"
            },
            {
                "id": "vorne-laufen1",
                "titel": "vorne laufen 1"
            },
            {
                "id": "vorne-laufen2",
                "titel": "vorne laufen 2"
            },
            {
                "id": "vorne-winken",
                "titel": "vorne winken"
            },
            {
                "id": "rechts-stehen",
                "titel": "rechts stehen"
            },
            {
                "id": "rechts-laufen1",
                "titel": "rechts laufen 1"
            },
            {
                "id": "rechts-laufen2",
                "titel": "rechts laufen 2"
            },
            {
                "id": "rechts-laufen3",
                "titel": "rechts laufen 3"
            },
            {
                "id": "rechts-laufen4",
                "titel": "rechts laufen 4"
            },
            {
                "id": "links-stehen",
                "titel": "links stehen"
            },
            {
                "id": "links-laufen1",
                "titel": "links laufen 1"
            },
            {
                "id": "links-laufen2",
                "titel": "links laufen 2"
            },
            {
                "id": "links-laufen3",
                "titel": "links laufen 3"
            },
            {
                "id": "links-laufen4",
                "titel": "links laufen 4"
            },
            {
                "id": "hinten-stehen",
                "titel": "hinten stehen"
            },
            {
                "id": "hinten-laufen1",
                "titel": "hinten laufen 1"
            },
            {
                "id": "hinten-laufen2",
                "titel": "hinten laufen 2"
            }
        ]
    }
];

/** Größe jedes Kostüms auf der Bühne (Bildpunkte bei Größe 100 %) */
export const GSG_FIGUR_GROESSE = { breite: 110, hoehe: 121 };

/** Bühnenbilder: SpriteLibrary.Buehnenbild mit Nummer index (480 × 360) */
export const GSG_BUEHNENBILD_NAME = "Buehnenbild";
export const GSG_BUEHNENBILDER: { index: number; id: string; titel: string }[] = [
    {
        "index": 0,
        "id": "wiese",
        "titel": "Wiese"
    },
    {
        "index": 1,
        "id": "wald",
        "titel": "Wald"
    },
    {
        "index": 2,
        "id": "stadt",
        "titel": "Stadt"
    },
    {
        "index": 3,
        "id": "schulhof",
        "titel": "Schulhof"
    },
    {
        "index": 4,
        "id": "weltraum",
        "titel": "Weltraum"
    },
    {
        "index": 5,
        "id": "unterwasser",
        "titel": "Unterwasser"
    }
];

/** alle Namen der Bildtafel (für SpriteLibrary) */
export const GSG_SPRITESHEET_NAMES: string[] = [...GSG_FIGUREN.map((f) => f.name), GSG_BUEHNENBILD_NAME];
