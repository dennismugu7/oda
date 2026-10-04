// Edit product (design 18-edit-product), opened from the Shop tab.
import { useLocalSearchParams } from 'expo-router';
import { ProductForm } from '@/catalogue/ProductForm';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductForm productId={id} />;
}
