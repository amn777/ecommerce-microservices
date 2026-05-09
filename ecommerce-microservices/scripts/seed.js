#!/usr/bin/env node
/**
 * Seed Script - Populates sample data for development
 * Run: node scripts/seed.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sampleProducts = [
  {
    name: 'Apple MacBook Pro 14-inch M3',
    sku: 'APPLE-MBP-14-M3',
    category: 'Electronics',
    subcategory: 'Laptops',
    brand: 'Apple',
    price: 1999.99,
    comparePrice: 2199.99,
    description: 'The most powerful MacBook Pro ever. With the M3 chip, it delivers breakthrough performance and battery life.',
    shortDescription: 'M3 chip, 14-inch Liquid Retina XDR display, 18hr battery',
    stock: 50,
    lowStockThreshold: 5,
    tags: ['laptop', 'apple', 'macbook', 'pro', 'm3'],
    images: [{ url: 'https://example.com/macbook-pro-14.jpg', alt: 'MacBook Pro 14' }],
    attributes: { ram: '18GB', storage: '512GB SSD', color: 'Space Black', display: '14.2-inch' },
    isFeatured: true,
    weight: 1.55,
  },
  {
    name: 'Sony WH-1000XM5 Wireless Headphones',
    sku: 'SONY-WH1000XM5',
    category: 'Electronics',
    subcategory: 'Audio',
    brand: 'Sony',
    price: 349.99,
    comparePrice: 399.99,
    description: 'Industry-leading noise cancellation with 30-hour battery life and crystal clear hands-free calling.',
    shortDescription: '30hr battery, best-in-class noise cancellation',
    stock: 120,
    lowStockThreshold: 15,
    tags: ['headphones', 'sony', 'wireless', 'noise-cancelling'],
    images: [{ url: 'https://example.com/sony-xm5.jpg', alt: 'Sony WH-1000XM5' }],
    attributes: { color: 'Black', connectivity: 'Bluetooth 5.2', batteryLife: '30 hours' },
    isFeatured: true,
    weight: 0.25,
  },
  {
    name: 'Nike Air Max 270',
    sku: 'NIKE-AM270-BLK-10',
    category: 'Fashion',
    subcategory: 'Shoes',
    brand: 'Nike',
    price: 149.99,
    description: 'Inspired by two icons of Air: the Air Max 180 and Air Max 93.',
    shortDescription: 'Max Air heel unit for all-day comfort',
    stock: 200,
    lowStockThreshold: 20,
    tags: ['shoes', 'nike', 'sneakers', 'air-max'],
    images: [{ url: 'https://example.com/nike-am270.jpg', alt: 'Nike Air Max 270' }],
    attributes: { size: '10', color: 'Black/White', gender: 'Unisex' },
    isFeatured: false,
    weight: 0.8,
  },
  {
    name: 'Samsung 65" 4K QLED Smart TV',
    sku: 'SAMSUNG-65-QLED-4K',
    category: 'Electronics',
    subcategory: 'TVs',
    brand: 'Samsung',
    price: 1299.99,
    comparePrice: 1599.99,
    description: 'Quantum Dot technology with 100% Color Volume. Neo Quantum Processor 4K for brilliance.',
    shortDescription: '65" QLED 4K, 120Hz, Smart TV with Alexa',
    stock: 30,
    lowStockThreshold: 5,
    tags: ['tv', 'samsung', '4k', 'qled', 'smart-tv'],
    images: [{ url: 'https://example.com/samsung-tv.jpg', alt: 'Samsung 65" QLED' }],
    attributes: { size: '65 inches', resolution: '4K', refreshRate: '120Hz', smartTV: true },
    isFeatured: true,
  },
  {
    name: 'The Midnight Library - Matt Haig',
    sku: 'BOOK-MIDNIGHT-LIB',
    category: 'Books',
    subcategory: 'Fiction',
    brand: 'Canongate Books',
    price: 14.99,
    description: 'Between life and death there is a library. In The Midnight Library, Matt Haig\'s enchanting novel.',
    shortDescription: 'International bestseller - a story about regret, possibility and hope',
    stock: 500,
    lowStockThreshold: 50,
    tags: ['book', 'fiction', 'bestseller', 'matt-haig'],
    images: [{ url: 'https://example.com/midnight-library.jpg', alt: 'The Midnight Library' }],
    attributes: { author: 'Matt Haig', pages: 304, language: 'English', format: 'Paperback' },
    isFeatured: false,
    weight: 0.3,
  },
  {
    name: 'Instant Pot Duo 7-in-1',
    sku: 'INSTANT-POT-DUO-7',
    category: 'Home & Kitchen',
    subcategory: 'Appliances',
    brand: 'Instant Pot',
    price: 89.99,
    comparePrice: 119.99,
    description: '7 appliances in 1: Pressure Cooker, Slow Cooker, Rice Cooker, Steamer, Sauté, Yogurt Maker & Warmer.',
    shortDescription: '7-in-1 multi-cooker, 6 quart',
    stock: 150,
    lowStockThreshold: 20,
    tags: ['kitchen', 'instant-pot', 'pressure-cooker', 'appliance'],
    images: [{ url: 'https://example.com/instant-pot.jpg', alt: 'Instant Pot Duo' }],
    attributes: { capacity: '6 Quart', functions: 7, color: 'Stainless Steel' },
    isFeatured: false,
  },
];

async function seed() {
  console.log('🌱 Starting seed process...\n');

  // Step 1: Register admin user
  console.log('1️⃣  Creating admin user...');
  let adminToken;
  try {
    const { data } = await axios.post(`${BASE_URL}/api/v1/auth/register`, {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@ecommerce.com',
      password: 'Admin@123456',
      phone: '+1234567890',
    });
    adminToken = data.data.accessToken;
    console.log('   ✅ Admin user created:', data.data.user.email);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log('   ℹ️  Admin already exists, logging in...');
      const { data } = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
        email: 'admin@ecommerce.com',
        password: 'Admin@123456',
      });
      adminToken = data.data.accessToken;
    } else {
      console.error('   ❌ Admin creation failed:', err.response?.data || err.message);
    }
  }

  // Step 2: Register test customer
  console.log('\n2️⃣  Creating test customer...');
  try {
    const { data } = await axios.post(`${BASE_URL}/api/v1/auth/register`, {
      firstName: 'John',
      lastName: 'Doe',
      email: 'customer@ecommerce.com',
      password: 'Customer@123456',
      phone: '+9876543210',
    });
    console.log('   ✅ Customer created:', data.data.user.email);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log('   ℹ️  Customer already exists');
    } else {
      console.error('   ❌ Customer creation failed:', err.response?.data || err.message);
    }
  }

  // Step 3: Create sample products
  console.log('\n3️⃣  Creating sample products...');
  const headers = { Authorization: `Bearer ${adminToken}` };

  for (const product of sampleProducts) {
    try {
      const { data } = await axios.post(`${BASE_URL}/api/v1/products`, product, { headers });
      console.log(`   ✅ Created: ${data.data.product.name} (${data.data.product.sku})`);
      await delay(100);
    } catch (err) {
      if (err.response?.status === 409) {
        console.log(`   ℹ️  Already exists: ${product.sku}`);
      } else {
        console.error(`   ❌ Failed: ${product.name}`, err.response?.data || err.message);
      }
    }
  }

  console.log('\n✨ Seed complete!\n');
  console.log('📋 Test Credentials:');
  console.log('   Admin:    admin@ecommerce.com / Admin@123456');
  console.log('   Customer: customer@ecommerce.com / Customer@123456');
  console.log('\n🔗 API Base URL:', BASE_URL);
  console.log('📊 Kafka UI:    http://localhost:8090');
  console.log('🔴 Redis UI:    http://localhost:8091');
  console.log('');
}

seed().catch(console.error);
