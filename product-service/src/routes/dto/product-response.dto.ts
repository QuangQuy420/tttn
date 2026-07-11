import { FrameShape } from '../../db/enums/frame-shape.enum';
import { GenderTarget } from '../../db/enums/gender-target.enum';
import { ProductStatus } from '../../db/enums/product-status.enum';
import { FaceShape } from '../../db/enums/face-shape.enum';

export class BrandSummaryDto {
  id: string;
  name: string;
  logoUrl: string | null;
}

export class CategorySummaryDto {
  id: string;
  name: string;
  slug: string;
}

export class ProductVariantResponseDto {
  id: string;
  color: string;
  size: string;
  extraPrice: number;
  skuVariant: string;
}

export class ProductImageResponseDto {
  id: string;
  variantId: string | null;
  imageUrl: string;
  isThumbnail: boolean;
  sortOrder: number;
}

export class ProductResponseDto {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  faceFitNote: string | null;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material: string | null;
  basePrice: number;
  status: ProductStatus;
  brand: BrandSummaryDto;
  category: CategorySummaryDto;
  variants: ProductVariantResponseDto[];
  images: ProductImageResponseDto[];
  faceShapes: FaceShape[];
  createdAt: Date;
  updatedAt: Date;
}
