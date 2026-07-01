
import type { ReactNode } from "react";
import { motion } from "framer-motion";

type RevealSectionProps = {
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3 | 4 | 5;
};

export function RevealSection({
  children,
  className = "",
  delay = 0,
}: RevealSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
