import type { FaceShapeTag } from "./product";

// Mirrors face-processing-service's AnalyzeResponse/FaceMeasurements Pydantic schemas
// (face-processing-service/app/schemas/face.py) field-for-field. FaceMeasurements has no
// camelCase alias config, so it serializes as snake_case on the wire (unlike AnalyzeResponse's
// own top-level fields, which are already camelCase in the Pydantic model itself). Measurements
// are in normalized image-space units (fractions of image width/height), not millimeters.
export interface FaceMeasurements {
  face_length: number;
  forehead_width: number;
  cheekbone_width: number;
  jaw_width: number;
  length_to_width_ratio: number;
  cheekbone_to_jaw_ratio: number;
  forehead_to_jaw_ratio: number;
}

export interface FaceAnalysisResult {
  id: string;
  faceShape: FaceShapeTag;
  measurements: FaceMeasurements;
  confidence: number;
  imageUrl: string;
}
