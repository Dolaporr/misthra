# Misthra mission board artwork

Three original images generated with the built-in image_gen tool and copied into the project. No product source edited.

| Asset | Dimensions | Format | Transparency |
| --- | --- | --- | --- |
| public/media/mission-board-hero.png | 1672 × 941 | PNG RGB | Opaque |
| public/media/mission-category-portrait.png | 1086 × 1448 | PNG RGB | Opaque |
| public/media/mission-connection-hands.png | 2172 × 724 | PNG RGBA | Native alpha, range 0–255 |

All three were visually inspected with view_image. Hero places the chrome android on the right and leaves dark copy space at left. Portrait uses sculptural black ceramic, silver, and cobalt reflections. The hand image contains a human hand in the left half and robot hand in the right half, with cropped forearms at the outer edges and a small central gap. At representative fingertip rows, the gap center is x=1087 on a 2172px canvas (geometric center x=1086), within one pixel. At y=305/310, the high-opacity edge gap is 29px. The alpha channel contains 1,064,146 fully transparent pixels, 507,768 partially transparent pixels, and 614 fully opaque pixels; most visible pixels have alpha 250–254.

Exact prompt and generation origin accompany each PNG in its .png.prompt.json sidecar. The original generated files remain under /Users/mac/.codex/generated_images/01a1b7a2-932d-7ff0-a72a-dfeaf8370d4e/. Prompt text is also embedded as PNG tEXt key impeccable:prompt via impeccable embed-prompt, and a byte-level PNG chunk read verified that each embedded prompt exactly matches its sidecar.

The targeted Impeccable detector scan of the three prompt sidecars returned [] and exit 0. Direct PNG targets reported ENOENT despite their existence and successful reads by image tools/Pillow; the image-target detector run is therefore unverified. The detector's static scan is not a substitute for the completed visual checks.

Fine native cutout edge fringes remain around a few hand contours, most visible on pure black at native scale. A targeted image_gen edge cleanup edit was tested and inspected but not selected because it retained some fringes and the original composition was already usable; the original project PNG remains the selected asset. Discarded cleanup output: /Users/mac/.codex/generated_images/01a1b7a2-932d-7ff0-a72a-dfeaf8370d4e/exec-09bda8f6-3c5f-452a-978e-632221b61192.png. No external Python image editing, cropping, or repainting was used.


## Web delivery derivatives

Original PNGs remain intact; SHA-256 hashes were recorded before conversion and verified unchanged afterward. Format-only WebP compression used Pillow with quality 90, method 6, exact=True. There was no resize, crop, compositing, or repainting. All WebPs were visually inspected with view_image.

| Derivative | Dimensions / mode | Bytes |
| --- | --- | --- |
| public/media/mission-board-hero.webp | 1672 × 941 RGB | 138,284 |
| public/media/mission-category-portrait.webp | 1086 × 1448 RGB | 137,408 |
| public/media/mission-connection-hands.webp | 2172 × 724 RGBA | 206,528 |

Combined delivery size is 482,220 bytes (about 471 KiB), approximately 90.7% less than the 5,158,922-byte PNG set. The hands WebP alpha channel is byte-for-byte identical to the source PNG alpha. Each .webp.prompt.json sidecar records the original PNG path and SHA-256, generation origin, exact prompt, conversion settings, dimensions, mode, and byte count. The targeted detector scan of these three derivative sidecars returned [] with exit 0.
