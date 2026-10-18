import { expect, test } from 'bun:test';
import { spinnerDriver } from '../src/presentation/spinner';

test('one pending Pipeline refresh loop repaints and stops after completion', async () => {
  const driver = spinnerDriver();
  let renders = 0;
  let registrations = 0;
  driver.bind({
    hasUI: true,
    ui: {
      setWidget(_key, factory) {
        if (typeof factory === 'function') {
          registrations++;
          factory({
            requestRender() {
              renders++;
            },
          });
        }
      },
    },
  });
  driver.start();
  driver.start();
  await Bun.sleep(100);
  expect(registrations).toBe(1);
  expect(renders).toBeGreaterThan(0);
  driver.end();
  const before = renders;
  await Bun.sleep(100);
  expect(renders).toBeGreaterThan(before);
  driver.end();
  const stopped = renders;
  await Bun.sleep(100);
  expect(renders).toBe(stopped);
  driver.dispose();
});
