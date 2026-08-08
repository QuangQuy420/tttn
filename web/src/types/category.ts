// Mirrors product-service's flat CategoryResponseDto.
export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface CreateCategoryPayload {
  name: string;
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;
