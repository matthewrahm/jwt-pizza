import { test, expect } from 'playwright-test-coverage';
import { Page } from '@playwright/test';

// User types and roles
enum Role {
  Diner = 'diner',
  Franchisee = 'franchisee',
  Admin = 'admin',
}

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  roles: { role: Role; objectId?: number }[];
}

// Test users
const testUsers: Record<string, User> = {
  diner: {
    id: 3,
    name: 'Kai Chen',
    email: 'd@jwt.com',
    password: 'diner',
    roles: [{ role: Role.Diner }],
  },
  franchisee: {
    id: 4,
    name: 'pizza franchisee',
    email: 'f@jwt.com',
    password: 'franchisee',
    roles: [{ role: Role.Diner }, { role: Role.Franchisee, objectId: 1 }],
  },
  admin: {
    id: 1,
    name: '常用名字',
    email: 'a@jwt.com',
    password: 'admin',
    roles: [{ role: Role.Admin }],
  },
};

// Menu items
const menuItems = [
  { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
  { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
  { id: 3, title: 'Margarita', image: 'pizza3.png', price: 0.0014, description: 'Essential classic' },
  { id: 4, title: 'Crusty', image: 'pizza4.png', price: 0.0024, description: 'A dry mouthed favorite' },
];

// Franchises
const franchises = [
  {
    id: 1,
    name: 'pizzaPocket',
    admins: [{ id: 4, name: 'pizza franchisee', email: 'f@jwt.com' }],
    stores: [
      { id: 1, name: 'SLC', totalRevenue: 0.5 },
      { id: 2, name: 'Provo', totalRevenue: 0.3 },
    ],
  },
  {
    id: 2,
    name: 'LotaPizza',
    admins: [{ id: 5, name: 'John Doe', email: 'j@jwt.com' }],
    stores: [
      { id: 3, name: 'Lehi', totalRevenue: 0.2 },
    ],
  },
];

// Mock helper function
async function mockEndpoints(page: Page, options: {
  loggedInUser?: User | null;
  loginUser?: string;
} = {}) {
  let loggedInUser: User | null = options.loggedInUser || null;

  // Auth endpoints
  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    
    if (method === 'POST') {
      // Register
      const body = route.request().postDataJSON();
      const newUser: User = {
        id: 10,
        name: body.name,
        email: body.email,
        password: body.password,
        roles: [{ role: Role.Diner }],
      };
      loggedInUser = newUser;
      await route.fulfill({
        json: {
          user: { id: newUser.id, name: newUser.name, email: newUser.email, roles: newUser.roles },
          token: 'test-token',
        },
      });
    } else if (method === 'PUT') {
      // Login
      const body = route.request().postDataJSON();
      const user = Object.values(testUsers).find(u => u.email === body.email && u.password === body.password);
      if (user) {
        loggedInUser = user;
        await route.fulfill({
          json: {
            user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
            token: 'test-token',
          },
        });
      } else {
        await route.fulfill({ status: 404, json: { message: 'unknown user' } });
      }
    } else if (method === 'DELETE') {
      // Logout
      loggedInUser = null;
      await route.fulfill({ json: { message: 'logout successful' } });
    }
  });

  // User me endpoint
  await page.route('*/**/api/user/me', async (route) => {
    if (loggedInUser) {
      await route.fulfill({
        json: { id: loggedInUser.id, name: loggedInUser.name, email: loggedInUser.email, roles: loggedInUser.roles },
      });
    } else {
      await route.fulfill({ status: 401, json: { message: 'unauthorized' } });
    }
  });

  // Menu endpoint
  await page.route('*/**/api/order/menu', async (route) => {
    await route.fulfill({ json: menuItems });
  });

  // Franchise list endpoint
  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { franchises, more: false } });
    } else if (route.request().method() === 'POST') {
      // Create franchise
      const body = route.request().postDataJSON();
      const newFranchise = {
        id: 10,
        name: body.name,
        admins: body.admins.map((a: any) => ({ ...a, id: 10, name: 'Test User' })),
        stores: [],
      };
      await route.fulfill({ json: newFranchise });
    }
  });

  // User franchises endpoint
  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (loggedInUser && loggedInUser.roles.some(r => r.role === Role.Franchisee)) {
        await route.fulfill({ json: [franchises[0]] });
      } else {
        await route.fulfill({ json: [] });
      }
    } else if (method === 'DELETE') {
      await route.fulfill({ json: { message: 'franchise deleted' } });
    }
  });

  // Create store endpoint
  await page.route(/\/api\/franchise\/\d+\/store$/, async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: { id: 10, franchiseId: 1, name: body.name, totalRevenue: 0 },
    });
  });

  // Delete store endpoint
  await page.route(/\/api\/franchise\/\d+\/store\/\d+$/, async (route) => {
    await route.fulfill({ json: { message: 'store deleted' } });
  });

  // Order endpoints
  await page.route('*/**/api/order', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: {
          dinerId: loggedInUser?.id || 0,
          orders: [
            {
              id: 1,
              franchiseId: 1,
              storeId: 1,
              date: '2024-06-05T05:14:40.000Z',
              items: [{ id: 1, menuId: 1, description: 'Veggie', price: 0.0038 }],
            },
          ],
          page: 1,
        },
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          order: { ...body, id: 100 },
          jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZW5kb3IiOnsiaWQiOiJ0ZXN0IiwibmFtZSI6IlRlc3QgUGl6emEifSwiZGluZXIiOnsiaWQiOjMsIm5hbWUiOiJLYWkgQ2hlbiIsImVtYWlsIjoiZEBqd3QuY29tIn0sIm9yZGVyIjp7ImlkIjoxMDAsIml0ZW1zIjpbeyJtZW51SWQiOjEsImRlc2NyaXB0aW9uIjoiVmVnZ2llIiwicHJpY2UiOjAuMDAzOH1dfSwiaWF0IjoxNzA3MTQ1MDAwfQ.test-signature',
        },
      });
    }
  });

  // Verify order endpoint (pizza factory)
  await page.route('*/**/api/order/verify', async (route) => {
    await route.fulfill({
      json: {
        message: 'valid',
        payload: {
          vendor: { id: 'test', name: 'Test Pizza' },
          diner: { id: 3, name: 'Kai Chen', email: 'd@jwt.com' },
          order: { id: 100, items: [{ menuId: 1, description: 'Veggie', price: 0.0038 }] },
        },
      },
    });
  });

  // Docs endpoints
  await page.route('*/**/api/docs', async (route) => {
    await route.fulfill({
      json: {
        version: '1.0.0',
        endpoints: [
          { method: 'POST', path: '/api/auth', description: 'Register a new user', requiresAuth: false },
          { method: 'PUT', path: '/api/auth', description: 'Login existing user', requiresAuth: false },
          { method: 'DELETE', path: '/api/auth', description: 'Logout a user', requiresAuth: true },
        ],
      },
    });
  });
}

// Helper to login a user
async function loginUser(page: Page, email: string, password: string) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

// ===== BASIC PAGE TESTS =====

test('home page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  expect(await page.title()).toBe('JWT Pizza');
  await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
});

test('about page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByText('The secret sauce')).toBeVisible();
  await expect(page.getByText('At JWT Pizza, our amazing employees')).toBeVisible();
});

test('history page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('Mama Rucci, my my')).toBeVisible();
});

test('not found page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/nonexistent-page');
  
  await expect(page.getByText('Oops')).toBeVisible();
});

// ===== AUTH TESTS =====

test('register new user', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByText('Welcome to the party')).toBeVisible();
  
  await page.getByPlaceholder('Full name').fill('Test User');
  await page.getByPlaceholder('Email address').fill('test@jwt.com');
  await page.getByPlaceholder('Password').fill('testpass');
  await page.getByRole('button', { name: 'Register' }).click();
  
  await expect(page.getByRole('link', { name: 'TU' })).toBeVisible();
});

test('login as diner', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('login with invalid credentials', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByPlaceholder('Email address').fill('invalid@jwt.com');
  await page.getByPlaceholder('Password').fill('wrongpass');
  await page.getByRole('button', { name: 'Login' }).click();
  
  await expect(page.getByText('unknown user')).toBeVisible();
});

test('logout', async ({ page }) => {
  await mockEndpoints(page, { loggedInUser: testUsers.diner });
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  await page.getByRole('link', { name: 'Logout' }).click();
  
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});

// ===== DINER TESTS =====

test('view diner dashboard', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  await page.getByRole('link', { name: 'KC' }).click();
  
  await expect(page.getByText('Your pizza kitchen')).toBeVisible();
  await expect(page.getByText('Kai Chen')).toBeVisible();
  await expect(page.getByText('d@jwt.com')).toBeVisible();
});

test('view order history on diner dashboard', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  await page.getByRole('link', { name: 'KC' }).click();
  
  await expect(page.getByText('Here is your history')).toBeVisible();
});

// ===== ORDER TESTS =====

test('view menu', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('button', { name: 'Order now' }).click();
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
  await expect(page.getByText('Veggie')).toBeVisible();
  await expect(page.getByText('Pepperoni')).toBeVisible();
});

test('order pizza with login', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  // Go to menu
  await page.getByRole('button', { name: 'Order now' }).click();
  
  // Select store and pizza
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('link', { name: 'Image Description Veggie' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 1');
  
  // Checkout
  await page.getByRole('button', { name: 'Checkout' }).click();
  
  // Login
  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('diner');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // Pay
  await expect(page.getByText('Send me that pizza right now!')).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();
  
  // Verify delivery page
  await expect(page.getByText('Here is your JWT Pizza!')).toBeVisible();
});

test('order multiple pizzas', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  
  await page.getByRole('button', { name: 'Order now' }).click();
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('link', { name: 'Image Description Veggie' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByText('Send me those 2 pizzas right now!')).toBeVisible();
});

test('cancel order from payment page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  
  await page.getByRole('button', { name: 'Order now' }).click();
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('link', { name: 'Image Description Veggie' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
});

test('verify pizza JWT', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  
  // Complete an order
  await page.getByRole('button', { name: 'Order now' }).click();
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('link', { name: 'Image Description Veggie' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();
  
  // Verify
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('#hs-jwt-modal')).toContainText('valid');
});

// ===== FRANCHISE TESTS (as diner) =====

test('view franchise page as diner', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByText('So you want a piece of the pie?')).toBeVisible();
});

test('view franchise page as logged-in diner', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  
  await expect(page.getByText('So you want a piece of the pie?')).toBeVisible();
});

// ===== FRANCHISEE TESTS =====

test('login as franchisee and view dashboard', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'f@jwt.com', 'franchisee');
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  
  await expect(page.getByText('pizzaPocket')).toBeVisible();
  await expect(page.getByText('Everything you need to run')).toBeVisible();
});

test('franchisee creates store', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'f@jwt.com', 'franchisee');
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  
  await page.getByRole('button', { name: 'Create store' }).click();
  await expect(page.getByText('Create store', { exact: true })).toBeVisible();
  
  await page.getByPlaceholder('store name').fill('New Store');
  await page.getByRole('button', { name: 'Create' }).click();
});

test('franchisee closes store', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'f@jwt.com', 'franchisee');
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
  
  await page.getByRole('button', { name: 'Close' }).first().click();
});

// ===== ADMIN TESTS =====

test('login as admin and view dashboard', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();
  
  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
});

test('admin creates franchise', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();
  
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await expect(page.getByText('Create franchise', { exact: true })).toBeVisible();
  
  await page.getByPlaceholder('franchise name').fill('New Franchise');
  await page.getByPlaceholder('franchisee admin email').fill('t@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
});

test('admin closes franchise', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();
  
  // Click close on a franchise
  await page.getByRole('row', { name: /pizzaPocket/ }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
  
  await page.getByRole('button', { name: 'Close' }).first().click();
});

test('admin closes store', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'a@jwt.com', 'admin');
  await page.getByRole('link', { name: 'Admin' }).click();
  
  // Click close on a store
  await page.getByRole('row', { name: /SLC/ }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Sorry to see you go')).toBeVisible();
});

// ===== DOCS TESTS =====

test('view docs page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/docs');
  
  await expect(page.getByText('JWT Pizza API')).toBeVisible();
});

// ===== NAVIGATION TESTS =====

test('navigate through header links', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  // Click on logo to go home
  await page.getByRole('link', { name: 'home' }).click();
  await expect(page.getByRole('button', { name: 'Order now' })).toBeVisible();
});

test('footer links', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  // Check footer content
  await expect(page.getByRole('contentinfo')).toContainText('Franchise');
  await expect(page.getByRole('contentinfo')).toContainText('About');
  await expect(page.getByRole('contentinfo')).toContainText('History');
});

// ===== EDGE CASE TESTS =====

test('register link from login page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('main').getByText('Register').click();
  
  await expect(page.getByText('Welcome to the party')).toBeVisible();
});

test('login link from register page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('main').getByText('Login').click();
  
  await expect(page.getByText('Welcome back')).toBeVisible();
});

test('order more from delivery page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  await loginUser(page, 'd@jwt.com', 'diner');
  
  await page.getByRole('button', { name: 'Order now' }).click();
  await page.getByRole('combobox').selectOption('1');
  await page.getByRole('link', { name: 'Image Description Veggie' }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();
  
  await page.getByRole('button', { name: 'Order more' }).click();
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
});

// ===== ADDITIONAL COVERAGE TESTS =====

test('direct navigation to menu', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/menu');
  
  await expect(page.getByText('Awesome is a click away')).toBeVisible();
});

test('direct navigation to about', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/about');
  
  await expect(page.getByText('The secret sauce')).toBeVisible();
});

test('direct navigation to history', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/history');
  
  await expect(page.getByText('Mama Rucci, my my')).toBeVisible();
});

test('carousel on home page', async ({ page }) => {
  await mockEndpoints(page);
  await page.goto('/');
  
  // Check that quotes are visible
  await expect(page.locator('.hs-carousel')).toBeVisible();
});
