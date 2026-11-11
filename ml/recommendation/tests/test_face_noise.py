"""Plan 2026-09-29-12 (FaceFit hybrid): noisy face shapes from AI-1 test probabilities (T5)."""
import numpy as np
import pandas as pd

from recsys import face_noise

SHAPES = [shape.value for shape in face_noise.FACE_SHAPES]


def _one_hot_probabilities(labels: list[str]) -> face_noise.FaceProbabilities:
    probs = np.zeros((len(labels), len(SHAPES)))
    probs[np.arange(len(labels)), [SHAPES.index(label) for label in labels]] = 1.0
    return face_noise.FaceProbabilities(labels=np.array(labels), probs=probs)


def test_probabilities_one_hot_on_the_true_class_give_hard_labels_equal_to_true_labels_ac6(tmp_path):
    """AC6: a CSV whose rows are one-hot on the true class (columns in another order, mapped by name)
    -> soft == hard and argmax(hard) == true label."""
    labels = ["OVAL", "ROUND", "SQUARE", "HEART", "DIAMOND", "OBLONG", "HEART"]
    expected = _one_hot_probabilities(labels)
    columns = list(reversed(SHAPES))  # not FACE_SHAPES order: classes must be matched by name
    frame = pd.DataFrame(
        {f"p_{shape}": expected.probs[:, SHAPES.index(shape)] for shape in columns}
    )
    frame.insert(0, "true_label", labels)
    path = tmp_path / "test_probabilities_svm.csv"
    frame.to_csv(path, index=False)

    loaded = face_noise.load_face_probabilities(path)

    np.testing.assert_array_equal(loaded.labels, labels)
    np.testing.assert_array_equal(loaded.probs, expected.probs)
    hard = loaded.hard()
    np.testing.assert_array_equal(hard, loaded.probs)
    assert [SHAPES[i] for i in np.argmax(hard, axis=1)] == labels


def test_draws_are_seeded_keyed_by_user_and_match_the_true_shape_ac5():
    """AC5: every drawn image has the user's true shape; same seed -> same draws (common random numbers)."""
    image_labels = np.array(["OVAL", "ROUND", "OVAL", "HEART", "ROUND", "OVAL", "HEART"])
    true_shapes = {"u3": "HEART", "u1": "OVAL", "u2": "ROUND"}

    draws = face_noise.draw_images(true_shapes, image_labels, n_draws=20, seed=11)

    assert list(draws.index) == ["u1", "u2", "u3"]
    assert draws.shape == (3, 20)
    for user_id, shape in true_shapes.items():
        assert set(image_labels[draws.loc[user_id].to_numpy()]) == {shape}
    pd.testing.assert_frame_equal(face_noise.draw_images(dict(reversed(list(true_shapes.items()))), image_labels, 20, 11), draws)
