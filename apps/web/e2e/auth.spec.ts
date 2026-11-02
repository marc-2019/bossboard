import { test, expect, type Locator, type Page } from '@playwright/test';

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const lum = (rgb: [number, number, number]) =>
    0.2126 * linearize(rgb[0]) + 0.7152 * linearize(rgb[1]) + 0.0722 * linearize(rgb[2]);
  const lighter = Math.max(lum(fg), lum(bg));
  const darker = Math.min(lum(fg), lum(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

async function paintedColors(locator: Locator): Promise<{
  fg: [number, number, number];
  bg: [number, number, number];
}> {
  return locator.evaluate((el) => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return {
        rgb: [Number(match[1]), Number(match[2]), Number(match[3])] as [number, number, number],
        alpha: match[4] === undefined ? 1 : Number(match[4]),
      };
    };
    const fg = parse(getComputedStyle(el).color);
    let node: Element | null = el;
    let bg: [number, number, number] | null = null;
    while (node) {
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.alpha > 0) {
        bg = parsed.rgb;
        break;
      }
      node = node.parentElement;
    }
    if (!fg || !bg) throw new Error('missing painted colors');
    return { fg: fg.rgb, bg };
  });
}

const OLD_LEGAL_LINK_CLASS = 'text-accent font-medium hover:underline';

function captureRed(run: () => void): string {
  try {
    run();
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function requestLabel(method: string, url: string): string {
  try {
    const parsed = new URL(url);
    return `${method} ${parsed.origin}${parsed.pathname}`;
  } catch {
    return `${method} ${url.split('?')[0]}`;
  }
}

/** Abort every non-GET so it cannot reach a host. A finished non-GET fails the test. */
async function abortNonGet(page: Page): Promise<{ completedNonGet: string[]; abortedNonGet: string[] }> {
  const completedNonGet: string[] = [];
  const abortedNonGet: string[] = [];
  page.on('requestfinished', (req) => {
    if (req.method() !== 'GET') completedNonGet.push(requestLabel(req.method(), req.url()));
  });
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      abortedNonGet.push(requestLabel(req.method(), req.url()));
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return { completedNonGet, abortedNonGet };
}

/** Answer the auth POST in the browser. Do not call route.continue() or route.fetch(). */
async function stubAuthPost(page: Page, path: '/api/auth/login' | '/api/auth/register') {
  await page.route(`**${path}`, async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: 'PROXY_ERROR',
        message: 'Failed to connect to API',
      }),
    });
  });
}

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
      await stubAuthPost(page, '/api/auth/login');
      await page.goto('/login');

      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel('Password').fill('testpassword123');
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByText('Failed to connect to API')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
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
      await stubAuthPost(page, '/api/auth/register');
      await page.goto('/register');

      await page.getByLabel('Name').fill('Test User');
      await page.getByLabel('Email').fill('newuser@example.com');
      await page.getByLabel('Password').fill('testpassword123');
      await page.getByRole('button', { name: 'Create account' }).click();

      await expect(page.getByText('Failed to connect to API')).toBeVisible();
      await expect(page).toHaveURL(/\/register/);
    });

    test('navigates to login page via link', async ({ page }) => {
      await page.goto('/register');
      await page.getByRole('link', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test('renders homepage Privacy and Terms links near Create account without changing the form', async ({ page }) => {
      await page.goto('/register');

      const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
      await expect(privacy).toBeVisible();
      await expect(privacy).toHaveAttribute('href', 'https://api.instilligent.com/legal/privacy');
      await expect(privacy).toHaveAttribute('target', '_blank');
      await expect(privacy).toHaveAttribute('rel', 'noopener noreferrer');

      const terms = page.getByRole('link', { name: 'Terms', exact: true });
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
      expect(privacyBox!.height).toBeGreaterThanOrEqual(44);
      expect(privacyBox!.width).toBeGreaterThanOrEqual(44);
      expect(termsBox!.height).toBeGreaterThanOrEqual(44);
      expect(termsBox!.width).toBeGreaterThanOrEqual(44);

      for (const link of [privacy, terms]) {
        const { fg, bg } = await paintedColors(link);
        const ratio = contrastRatio(fg, bg);
        console.log(`legal-link contrast ${ratio.toFixed(4)} fg=${fg.join(',')} bg=${bg.join(',')}`);
        expect(bg).toEqual([255, 255, 255]);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }

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

    test('legal-link contrast is at least 4.5:1 at 390 and 1280 and fails on the old colour', async ({ page }) => {
      const { completedNonGet, abortedNonGet } = await abortNonGet(page);
      const viewports = [
        { width: 390, height: 844 },
        { width: 1280, height: 800 },
      ];

      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto('/register', { waitUntil: 'domcontentloaded' });

        expect(page.viewportSize()).toEqual(viewport);
        const inner = await page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }));
        expect(inner.width).toBe(viewport.width);
        expect(inner.height).toBe(viewport.height);

        const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
        const terms = page.getByRole('link', { name: 'Terms', exact: true });
        const submit = page.getByRole('button', { name: 'Create account' });
        await expect(privacy).toBeVisible();
        await expect(terms).toBeVisible();

        const submitBox = await submit.boundingBox();
        expect(submitBox).not.toBeNull();

        for (const [name, link] of [
          ['Privacy', privacy],
          ['Terms', terms],
        ] as const) {
          const box = await link.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
          expect(box!.y).toBeGreaterThanOrEqual(submitBox!.y + submitBox!.height);
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);

          const { fg, bg } = await paintedColors(link);
          const ratio = contrastRatio(fg, bg);
          console.log(
            `${name} @ ${viewport.width}x${viewport.height} contrast ${ratio.toFixed(4)} fg=${fg.join(',')} bg=${bg.join(',')} box=${box!.width.toFixed(1)}x${box!.height.toFixed(1)}`,
          );
          expect(bg).toEqual([255, 255, 255]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);

          await link.evaluate((el, oldClass) => {
            el.className = oldClass;
          }, OLD_LEGAL_LINK_CLASS);

          const oldBox = await link.boundingBox();
          const oldPaint = await paintedColors(link);
          const oldRatio = contrastRatio(oldPaint.fg, oldPaint.bg);
          expect(oldPaint.fg).toEqual([255, 107, 53]);
          expect(oldBox).not.toBeNull();

          const redContrast = captureRed(() => {
            expect(oldRatio).toBeGreaterThanOrEqual(4.5);
          });
          const redHeight = captureRed(() => {
            expect(oldBox!.height).toBeGreaterThanOrEqual(44);
          });
          const redWidth =
            oldBox!.width < 44
              ? captureRed(() => {
                  expect(oldBox!.width).toBeGreaterThanOrEqual(44);
                })
              : '';
          console.log(
            `RED old style ${name} @ ${viewport.width} ratio ${oldRatio.toFixed(4)} box=${oldBox!.width.toFixed(1)}x${oldBox!.height.toFixed(1)}\n${redContrast}\n${redHeight}${redWidth ? `\n${redWidth}` : ''}`,
          );
          expect(redContrast).not.toBe('');
          expect(oldRatio).toBeLessThan(4.5);
          expect(redHeight).not.toBe('');
          expect(oldBox!.height).toBeLessThan(44);
          if (name === 'Terms') {
            expect(redWidth).not.toBe('');
            expect(oldBox!.width).toBeLessThan(44);
          }
        }
      }

      console.log(`aborted non-GET (${abortedNonGet.length}): ${abortedNonGet.join(' | ') || '(none)'}`);
      expect(completedNonGet).toEqual([]);
      expect(abortedNonGet.every((line) => !line.startsWith('GET '))).toBe(true);
    });
  });
});
