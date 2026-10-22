import {
  Alert, Anchor, Button, Checkbox, Group, PasswordInput, Text, TextInput, Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import classes from './login.module.css';
import { useGlobalStore } from '@/stores/global_stores';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const loginUrl = `${basePath}/api/auth/login`;
// TODO: point this at your real reset endpoint.
const forgotUrl = `${basePath}/api/auth/forgot-password`;

// Parcels are polygons (outline only). "hot" is the selected parcel.
const PARCELS = [
  { id: 1, d: 'M40 60 L190 50 L200 170 L50 180 Z' },
  { id: 2, d: 'M200 50 L330 45 L340 160 L210 170 Z' },
  { id: 3, d: 'M340 45 L470 40 L480 150 L350 160 Z' },
  { id: 4, d: 'M490 40 L580 38 L580 145 L500 150 Z' },
  { id: 5, d: 'M50 200 L150 195 L160 330 L60 340 Z' },
  { id: 6, d: 'M160 195 L300 190 L310 320 L170 330 Z' },
  { id: 7, hot: true, d: 'M320 190 L460 185 L470 310 L330 320 Z' },
  { id: 8, d: 'M480 185 L580 182 L580 300 L490 308 Z' },
  { id: 9, d: 'M60 360 L180 352 L200 500 L70 510 Z' },
  { id: 10, d: 'M190 352 L330 345 L350 490 L210 500 Z' },
  { id: 11, d: 'M350 345 L480 340 L500 480 L360 490 Z' },
  { id: 12, d: 'M510 338 L580 335 L580 470 L520 478 Z' },
  { id: 13, d: 'M70 530 L230 520 L250 680 L80 690 Z' },
  { id: 14, d: 'M240 520 L400 512 L420 670 L260 680 Z' },
  { id: 15, d: 'M430 510 L580 505 L580 660 L440 670 Z' },
];

// Market value is line geometry (multi-line strings), one band per road.
// v = market value band (1 low to 4 high).
const ROADS = [
  { id: 1, v: 2, d: 'M30 182 L200 175 L335 168 L485 158 L600 148' },
  { id: 2, v: 4, d: 'M30 512 L195 505 L335 498 L500 488 L600 484' },
  { id: 3, v: 3, d: 'M195 40 L205 178 L165 335 L195 505 L240 695' },
  { id: 4, v: 1, d: 'M335 40 L338 168 L325 322 L355 495 L415 690' },
  { id: 5, v: 4, d: 'M485 38 L488 160 L475 315 L505 488 L585 650' },
];

const POIS = [
  [120, 118], [270, 108], [410, 100], [230, 262], [535, 245],
  [125, 430], [270, 425], [425, 415], [150, 605], [330, 600], [510, 585],
];

const LEGEND = [
  { key: 'parcels', label: 'Parcels' },
  { key: 'value', label: 'Market value' },
  { key: 'boundary', label: 'Administrative boundary' },
  { key: 'poi', label: 'Points of interest' },
];

type MapProps = {
  active: string | null;
};

function ParcelMap({ active }: MapProps) {
  // Dim any layer that is not the one hovered in the legend.
  const dim = (layers: string[]) => (active && !layers.includes(active) ? classes.dim : '');

  return (
    <svg className={classes.map} viewBox="0 0 620 740" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Sample parcel map">
      <defs>
        <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd3e0" stopOpacity="0" />
          <stop offset="1" stopColor="#9fd3e0" stopOpacity="0.28" />
        </linearGradient>
      </defs>
      <g className={`${classes.layerGroup} ${dim(['parcels'])}`}>
        {PARCELS.map((p, i) => (
          <path
            key={p.id}
            d={p.d}
            pathLength={1}
            className={p.hot ? classes.parcelHot : classes.parcel}
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </g>
      <g className={`${classes.layerGroup} ${dim(['value'])}`}>
        {ROADS.map((r, i) => (
          <path
            key={r.id}
            d={r.d}
            pathLength={1}
            className={`${classes.road} ${classes[`road${r.v}`]}`}
            style={{ animationDelay: `${0.6 + i * 0.3}s` }}
          />
        ))}
      </g>
      <rect className={classes.scan} x="0" y="0" width="620" height="60" />
      <path className={`${classes.boundary} ${dim(['boundary'])}`} d="M24 24 L602 22 L602 706 L28 714 Z" />
      <path className={`${classes.boundary} ${dim(['boundary'])}`} d="M24 348 L602 332" />
      {POIS.map(([x, y], i) => (
        <g key={`${x}-${y}`} className={`${classes.poiGroup} ${dim(['poi'])}`}>
          <circle cx={x} cy={y} r={5} className={classes.poiPulse} style={{ animationDelay: `${2 + i * 0.35}s` }} />
          <circle cx={x} cy={y} r={5} className={classes.poi} />
        </g>
      ))}
    </svg>
  );
}

type View = 'login' | 'forgot';

export default function Login() {
  const { setAuth } = useGlobalStore();
  const [view, setView] = useState<View>('login');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [layer, setLayer] = useState<string | null>(null);

  const form = useForm<{ username: string; password: string }>({
    initialValues: { username: '', password: '' },
    validate: {
      username: (val) => (val.length < 3 ? 'Username should be at least 3 characters' : null),
      password: (val) => (val.length <= 3 ? 'Password should include at least 4 characters' : null),
    },
  });

  const forgotForm = useForm<{ identifier: string }>({
    initialValues: { identifier: '' },
    validate: {
      identifier: (val) => (val.trim().length < 3 ? 'Enter your username or email' : null),
    },
  });

  const switchView = (next: View) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setView(next);
  };

  const handleSubmit = async () => {
    const validation = form.validate();
    if (validation.hasErrors) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({ data: form.values }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : JSON.stringify(data));
      }
      setAuth(data.user);
    } catch (err) {
      console.log(err instanceof Error ? err.message : err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    const validation = forgotForm.validate();
    if (validation.hasErrors) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);
      const response = await fetch(forgotUrl, {
        method: 'POST',
        body: JSON.stringify({ data: forgotForm.values }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.message === 'string' ? data.message : 'Could not send the reset link');
      }
      setSuccessMessage('If an account matches, a reset link is on its way. Check your inbox.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={classes.page}>
      <section className={classes.mapPanel}>
        <ParcelMap active={layer} />
        <div className={classes.mapCopy}>
          <Text className={classes.brand}>Tax Mapping</Text>
          <Title order={2} className={classes.mapTitle}>
            Parcels, market values, and points of interest within every administrative boundary.
          </Title>
          <ul className={classes.legend}>
            {LEGEND.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={classes.legendItem}
                  onMouseEnter={() => setLayer(item.key)}
                  onMouseLeave={() => setLayer(null)}
                  onFocus={() => setLayer(item.key)}
                  onBlur={() => setLayer(null)}
                >
                  <span className={`${classes.swatch} ${classes[`sw_${item.key}`]}`} />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={classes.formPanel}>
        {view === 'login' ? (
          <form className={classes.form} onSubmit={form.onSubmit(handleSubmit)} noValidate>
            <Title order={1} className={classes.title}>Sign in</Title>
            <Text className={classes.subtitle}>
              Use your Tax Mapping account to open your parcels and market values.
            </Text>

            {errorMessage && (
              <Alert color="red" variant="light" mt="md" title="Can't sign in">
                {errorMessage}
              </Alert>
            )}

            <TextInput
              label="Username"
              placeholder="Your username"
              withAsterisk
              mt="lg"
              radius="sm"
              size="md"
              autoComplete="username"
              classNames={{ label: classes.label, input: classes.input }}
              {...form.getInputProps('username')}
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              withAsterisk
              mt="md"
              radius="sm"
              size="md"
              autoComplete="current-password"
              classNames={{ label: classes.label, input: classes.input, innerInput: classes.innerInput }}
              {...form.getInputProps('password')}
            />

            <Group mt="md" justify="space-between">
              <Checkbox label="Keep me signed in" size="sm" classNames={{ label: classes.checkLabel }} />
              <Anchor component="button" type="button" size="sm" className={classes.link} onClick={() => switchView('forgot')}>
                Forgot password?
              </Anchor>
            </Group>

            <Button fullWidth mt="xl" size="md" radius="sm" type="submit" loading={loading} className={classes.submit}>
              Sign in
            </Button>
          </form>
        ) : (
          <form className={classes.form} onSubmit={forgotForm.onSubmit(handleForgot)} noValidate>
            <Title order={1} className={classes.title}>Reset your password</Title>
            <Text className={classes.subtitle}>
              Enter your username or email and we will send you a link to set a new password.
            </Text>

            {errorMessage && (
              <Alert color="red" variant="light" mt="md" title="Couldn't send the link">
                {errorMessage}
              </Alert>
            )}
            {successMessage && (
              <Alert color="teal" variant="light" mt="md" title="Link sent">
                {successMessage}
              </Alert>
            )}

            <TextInput
              label="Username or email"
              placeholder="Your username or email"
              withAsterisk
              mt="lg"
              radius="sm"
              size="md"
              autoComplete="username"
              classNames={{ label: classes.label, input: classes.input }}
              {...forgotForm.getInputProps('identifier')}
            />

            <Button fullWidth mt="xl" size="md" radius="sm" type="submit" loading={loading} className={classes.submit}>
              Send reset link
            </Button>

            <Anchor component="button" type="button" size="sm" mt="md" className={classes.link} onClick={() => switchView('login')}>
              Back to sign in
            </Anchor>
          </form>
        )}
      </section>
    </main>
  );
}