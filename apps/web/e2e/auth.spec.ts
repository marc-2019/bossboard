import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test.describe('Login Page', () => {
    test('renders login form with all elements', async ({ page }) => {
      await page.goto('/login');

      // Branding
      await expect(page.getByText('BossBoard').first()).toBeVisible();
      await expect(page.getByText('BB').first()).toBeVisible();

      // Form elements
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

      // Register link
      await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
    });

    test('email field has correct type and placeholder', async ({ page }) => {
      await page.goto('/login');

      const emailInput = page.getByLabel('Email');
      await expect(emailInput).toHaveAttribute('type', 'email');
      await expect(emailInput).toHaveAttribute('placeholder', 'you@example.com');
    });

    test('password field has correct type and placeholder', async ({ page }) => {
      await page.goto('/login');

      const passwordInput = page.getByLabel('Password');
      await expect(passwordInput).toHaveAttribute('type', 'password');
      await expect(passwordInput).toHaveAttribute('placeholder', 'Min. 8 characters');
    });

    test('shows error when submitting with API down', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel('Password').fill('testpassword123');
      await page.getByRole('button', { name: 'Sign in' }).click();

      // Should show error since Express API is not running
      await expect(page.getByText(/Failed to connect to API|Login failed|fetch failed/i)).toBeVisible({ timeout: 10000 });
    });

    test('navigates to register page via link', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'Sign up' }).click();
      await expect(page).toHaveURL('/register');
    });

    test('preserves redirect query param', async ({ page }) => {
      await page.goto('/login?redirect=%2Finvoices');
      await expect(page).toHaveURL(/redirect=%2Finvoices/);
    });
  });

  test.describe('Register Page', () => {
    test('renders registration form with all elements', async ({ page }) => {
      await page.goto('/register');

      // Branding
      await expect(page.getByText('BossBoard').first()).toBeVisible();

      // Form elements
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await expect(page.getByLabel('Name')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

      // Login link
      await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    });

    test('name field is optional (no required attribute)', async ({ page }) => {
      await page.goto('/register');
      const nameInput = page.getByLabel('Name');
      await expect(nameInput).not.toHaveAttribute('required', '');
    });

    test('email and password are required', async ({ page }) => {
      await page.goto('/register');
      await expect(page.getByLabel('Email')).toHaveAttribute('required', '');
      await expect(page.getByLabel('Password')).toHaveAttribute('required', '');
    });

    test('password has minimum length of 8', async ({ page }) => {
      await page.goto('/register');
      await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');
    });

    test('shows error when submitting with API down', async ({ page }) => {
      await page.goto('/register');

      await page.getByLabel('Name').fill('Test User');
      await page.getByLabel('Email').fill('newuser@example.com');
      await page.getByLabel('Password').fill('testpassword123');
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByText(/Failed to connect to API|Registration failed|fetch failed/i)).toBeVisible({ timeout: 10000 });
    });

    test('navigates to login page via link', async ({ page }) => {
      await page.goto('/register');
      await page.getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test('renders homepage Privacy and Terms links near Create account without changing the form', async ({ page }) => {
      await page.goto('/register');

      const privacy = page.getByRole('link', { name: 'Privacy' });
      await expect(privacy).toBeVisible();
      await expect(privacy).toHaveAttribute('href', 'https://api.instilligent.com/legal/privacy');
      await expect(privacy).toHaveAttribute('target', '_blank');
      await expect(privacy).toHaveAttribute('rel', 'noopener noreferrer');

      const terms = page.getByRole('link', { name: 'Terms' });
      await expect(terms).toBeVisible();
      await expect(terms).toHaveAttribute('href', 'https://api.instilligent.com/legal/terms');
      await expect(terms).toHaveAttribute('target', '_blank');
      await expect(terms).toHaveAttribute('rel', 'noopener noreferrer');

      const submit = page.getByRole('button', { name: 'Create account' });
      await expect(submit).toBeVisible();
      await expect(submit).toBeEnabled();
      await expect(submit).toHaveAttribute('type', 'submit');

      const submitBox = await submit.boundingBox();
      const privacyBox = await privacy.boundingBox();
      const termsBox = await terms.boundingBox();
      expect(submitBox).not.toBeNull();
      expect(privacyBox).not.toBeNull();
      expect(termsBox).not.toBeNull();
      const gapBelowButton = privacyBox!.y - (submitBox!.y + submitBox!.height);
      expect(gapBelowButton).toBeGreaterThanOrEqual(0);
      expect(gapBelowButton).toBeLessThan(80);
      expect(Math.abs(privacyBox!.y - termsBox!.y)).toBeLessThan(8);

      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await expect(page.getByLabel('Name')).toBeVisible();
      await expect(page.getByLabel('Name')).not.toHaveAttribute('required', '');
      await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
      await expect(page.getByLabel('Email')).toHaveAttribute('required', '');
      await expect(page.getByLabel('Email')).toHaveAttribute('placeholder', 'you@example.com');
      await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
      await expect(page.getByLabel('Password')).toHaveAttribute('required', '');
      await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');
      await expect(page.getByLabel('Password')).toHaveAttribute('placeholder', 'Min. 8 characters');
      await expect(page.getByLabel('Friend code (optional)')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
      await expect(page.getByRole('checkbox')).toHaveCount(0);
    });
  });
});
