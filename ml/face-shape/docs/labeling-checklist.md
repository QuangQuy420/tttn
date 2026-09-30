# Face-shape labeling checklist

Use this checklist when reviewing the contact sheets from `make review`
(`data/interim/review/<CLASS>.html`). Labels are judged on the face outline only
(forehead, cheekbones, jaw, chin, length vs width), not on hair, makeup or expression.

## Class rules

Measure mentally: **length** = hairline to chin, **width** = cheekbone to cheekbone.

| Class | Keep the label when |
|---|---|
| OVAL | Length about 1.3-1.5x width; forehead slightly wider than the jaw; jaw and chin softly rounded, no sharp corners. |
| ROUND | Length about equal to width (<= ~1.2x); full cheeks; rounded jaw with no visible angle; chin not pointed. |
| SQUARE | Length about equal to width; forehead, cheekbones and jaw about the same width; strong, angular jaw corners; flat chin. |
| HEART | Forehead (and/or cheekbones) clearly wider than the jaw; jaw narrows to a narrow or pointed chin. |
| DIAMOND | Cheekbones clearly wider than **both** the forehead and the jaw; narrow forehead; pointed chin. |
| OBLONG | Length >= ~1.5x width; forehead, cheekbones and jaw of similar width (straight sides); long chin. Source label "Rectangle" maps here. |

Common confusions to check twice: OVAL vs OBLONG (length ratio), ROUND vs OVAL (jaw
softness vs length), HEART vs DIAMOND (is the forehead wide or narrow?), SQUARE vs ROUND
(jaw corners).

## Reject the image (`DROP`) when

- The face is occluded: hands, masks, microphones, sunglasses or large glasses covering the cheekbones.
- Hair covers the forehead edges or the jaw line so the outline cannot be judged.
- The head is turned sideways (yaw > 20 deg) or strongly tilted up/down.
- Heavy blur, very low resolution, strong filters or a drawing/cartoon instead of a photo.
- More than one face, or the face is cut off by the image border.
- The image is a collage, a watermark covers the face, or it is clearly not the labeled class and
  you cannot decide the right one.

## Review procedure

1. Run `make manifest review`. Open `data/interim/review/index.html`.
2. **Pass 1 (per class):** scroll each class page and note every wrong or unusable image in
   `data/interim/review/relabels.csv`:

   ```csv
   image_id,new_label
   3f2a9c0d1b2e4f56,DIAMOND
   0a1b2c3d4e5f6789,DROP
   ```

   `new_label` must be one of `OVAL, ROUND, SQUARE, HEART, DIAMOND, OBLONG` or `DROP`.
   Copy the `image_id` from the caption. Start with DIAMOND (collected from Roboflow, most at risk).
3. Run `make manifest review` again: the relabels are applied and the pages are rebuilt.
4. **Pass 2 (another day, fresh eyes):** review the rebuilt pages again, focusing on the
   confusion pairs above. Add further rows to the same `relabels.csv`.
5. Keep `relabels.csv` as the record of changes (it is under `data/`, so back it up yourself; note
   the number of changes per class in the report). Then run the rest of the pipeline
   (`make dedup identity landmarks features split card`).
