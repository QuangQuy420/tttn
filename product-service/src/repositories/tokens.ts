/**
 * DI tokens for repository interfaces (Dependency Inversion — services depend on these
 * interfaces, not on TypeORM directly). See coder.md §2.
 */
export const BRAND_REPOSITORY = Symbol('BRAND_REPOSITORY');
export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export const PRODUCT_VARIANT_REPOSITORY = Symbol('PRODUCT_VARIANT_REPOSITORY');
export const PRODUCT_IMAGE_REPOSITORY = Symbol('PRODUCT_IMAGE_REPOSITORY');
export const PRODUCT_FACE_SHAPE_REPOSITORY = Symbol(
  'PRODUCT_FACE_SHAPE_REPOSITORY',
);
export const IMAGE_STORAGE_REPOSITORY = Symbol('IMAGE_STORAGE_REPOSITORY');
