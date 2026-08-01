"use client";

import { useEffect, useState } from "react";

const SLIDE_INTERVAL_MS = 4000;

const SLIDES = [
  "/thumbnails/thumbnail-1.jpg",
  "/thumbnails/thumbnail-2.jpg",
  "/thumbnails/thumbnail-3.jpg",
  "/thumbnails/thumbnail-4.jpg",
];

export function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hero-carousel" aria-hidden="true">
      {SLIDES.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- matches ImageWithFallback convention, see ProductCard
        <img
          key={src}
          src={src}
          alt=""
          className={`hero-carousel__slide${index === activeIndex ? " hero-carousel__slide--active" : ""}`}
        />
      ))}
    </div>
  );
}
