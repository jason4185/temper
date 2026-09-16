import { createContext, useContext } from "react";

export type ProductTourContextValue = {
  openTour: () => void;
};

export const ProductTourContext = createContext<ProductTourContextValue | null>(null);

export function useProductTour() {
  const context = useContext(ProductTourContext);
  if (!context) throw new Error("useProductTour must be used inside ProductTourProvider");
  return context;
}
