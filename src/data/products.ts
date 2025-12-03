import { Product } from '@/types/order';

export const defaultProducts: Product[] = [
  // Lanches
  { id: '1', name: 'X-Burger', price: 18.00, category: 'Lanches', description: 'Pão, hambúrguer, queijo, alface e tomate' },
  { id: '2', name: 'X-Bacon', price: 22.00, category: 'Lanches', description: 'Pão, hambúrguer, queijo, bacon, alface e tomate' },
  { id: '3', name: 'X-Tudo', price: 28.00, category: 'Lanches', description: 'Pão, hambúrguer, queijo, bacon, ovo, presunto, alface e tomate' },
  { id: '4', name: 'X-Salada', price: 16.00, category: 'Lanches', description: 'Pão, hambúrguer, queijo, alface, tomate e maionese' },
  
  // Bebidas
  { id: '5', name: 'Coca-Cola Lata', price: 6.00, category: 'Bebidas' },
  { id: '6', name: 'Guaraná Lata', price: 5.00, category: 'Bebidas' },
  { id: '7', name: 'Suco Natural', price: 8.00, category: 'Bebidas' },
  { id: '8', name: 'Água Mineral', price: 3.00, category: 'Bebidas' },
  
  // Porções
  { id: '9', name: 'Batata Frita', price: 15.00, category: 'Porções', description: 'Porção de batata frita crocante' },
  { id: '10', name: 'Onion Rings', price: 18.00, category: 'Porções', description: 'Anéis de cebola empanados' },
  { id: '11', name: 'Nuggets (10un)', price: 20.00, category: 'Porções' },
  
  // Sobremesas
  { id: '12', name: 'Milk Shake', price: 14.00, category: 'Sobremesas' },
  { id: '13', name: 'Sundae', price: 10.00, category: 'Sobremesas' },
];

export const categories = ['Lanches', 'Bebidas', 'Porções', 'Sobremesas'];
