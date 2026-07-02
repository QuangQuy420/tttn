"use client";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProduct } from "@/hooks/useProduct";

interface ProductDetailPageProps {
  id: string;
}

export function ProductDetailPage({ id }: ProductDetailPageProps) {
  const { product, isLoading, error } = useProduct(id);

  if (isLoading) return <LoadingState label="Loading product..." />;
  if (error) return <ErrorState message={error} />;
  if (!product) return <ErrorState message="Product not found." />;

  return (
    <article aria-labelledby="product-heading">
      <h1 id="product-heading">{product.name}</h1>
      <p className="product-detail__brand">{product.brand.name}</p>
      <p className="product-detail__category">{product.category.name}</p>
      <p className="product-detail__price">${product.basePrice.toFixed(2)}</p>
      {product.description && <p className="product-detail__description">{product.description}</p>}

      <dl className="product-detail__attributes">
        <dt>Frame shape</dt>
        <dd>{product.frameShape}</dd>
        <dt>Gender</dt>
        <dd>{product.genderTarget}</dd>
        {product.material && (
          <>
            <dt>Material</dt>
            <dd>{product.material}</dd>
          </>
        )}
      </dl>

      <section aria-labelledby="product-images-heading">
        <h2 id="product-images-heading">Images</h2>
        {product.images.length === 0 ? (
          <p>No images available.</p>
        ) : (
          <ul className="product-detail__images">
            {product.images.map((image) => (
              <li key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- see ProductCard */}
                <img src={image.imageUrl} alt={product.name} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="product-variants-heading">
        <h2 id="product-variants-heading">Variants</h2>
        {product.variants.length === 0 ? (
          <p>No variants available.</p>
        ) : (
          <ul className="product-detail__variants">
            {product.variants.map((variant) => (
              <li key={variant.id}>
                {variant.color} / {variant.size}
                {variant.extraPrice > 0 && ` (+$${variant.extraPrice.toFixed(2)})`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
