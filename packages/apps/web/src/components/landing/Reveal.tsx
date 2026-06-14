"use client";

import { motion } from "framer-motion";

/** Fade-up on scroll-in. Mirrors the design's `.reveal` behavior. */
export default function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.46, ease: [0.22, 0.7, 0.18, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
