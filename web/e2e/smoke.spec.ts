import { test, expect } from '@playwright/test'

test('sign-in page loads', async ({ page }) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
})

test('sign-up page loads', async ({ page }) => {
  await page.goto('/sign-up')
  await expect(
    page.getByRole('heading', { name: 'Create an account' }),
  ).toBeVisible()
  await expect(page.getByPlaceholder('Name')).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
})
