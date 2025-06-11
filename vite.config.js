import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [`{src,test}\/${configDefaults.include[0]}`],
    coverage: {
      include: ['src/**'],
    },
  },
});
