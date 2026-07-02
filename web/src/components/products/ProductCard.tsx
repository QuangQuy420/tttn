import Link from "next/link";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];

  return (
    <Link href={`/products/${product.id}`} className="product-card">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- seeded catalog image URLs, not worth wiring next/image domains for in Sprint 1.
        <img src={thumbnail.imageUrl} alt={product.name} className="product-card__image" />
      ) : (
        <div className="product-card__image product-card__image--placeholder" />
      )}
      <h3 className="product-card__name">{product.name}</h3>
      <p className="product-card__brand">{product.brand.name}</p>
      <p className="product-card__price">${product.basePrice.toFixed(2)}</p>
    </Link>
  );
}
