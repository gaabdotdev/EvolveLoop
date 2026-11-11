import { totalItems } from './cart.js';
export function canCheckout(ids) { return totalItems(ids) > 0; }
export function shippingCost(ids) { return canCheckout(ids) ? 5 : 0; }
