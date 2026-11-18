export const FIXTURES = [
  {
    slug: 'number-input',
    title: 'Number input',
    variants: [],
    load: () =>
      import('./components/number-input-fixture').then(
        ({NumberInputFixture}) => NumberInputFixture,
      ),
  },
  {
    slug: 'toggle-group-input',
    title: 'Toggle group input',
    variants: [
      '?isPassive',
      '?isDisabled',
      '?isDisabled&isPassive',
      '?isReadOnly',
      '?isReadOnly&isPassive',
    ],
    load: () =>
      import('./components/toggle-group-input-fixture').then(
        ({ToggleGroupInputFixture}) => ToggleGroupInputFixture,
      ),
  },
  {
    slug: 'array-input',
    title: 'Array input',
    variants: [
      '?count=0',
      '?errorDisplay=onTouched',
      '?isDisabled',
      '?isDisabled&hasInvalidLink',
      '?isReadOnly',
      '?isReadOnly&hasInvalidLink',
    ],
    load: () =>
      import('./components/array-input-fixture').then(
        ({ArrayInputFixture}) => ArrayInputFixture,
      ),
  },
  {
    slug: 'checkbox-group-input',
    title: 'Checkbox group input',
    variants: ['?isDisabled', '?isReadOnly', '?isReadOnly&hasChannel'],
    load: () =>
      import('./components/checkbox-group-input-fixture').then(
        ({CheckboxGroupInputFixture}) => CheckboxGroupInputFixture,
      ),
  },
  {
    slug: 'form-controls',
    title: 'Form controls',
    variants: [
      '?options=api',
      '?options=memory&delay=1500',
      '?options=held',
      '?options=grouped',
      '?options=users',
      '?options=users&delay=800',
      '?options=members',
      '?options=members&max=2',
      '?options=tags',
      '?options=creatable',
      '?options=creatable&create=fail',
      '?options=creatable&source=remote',
    ],
    load: () =>
      import('./components/form-controls-fixture').then(
        ({FormControlsFixture}) => FormControlsFixture,
      ),
  },
  {
    slug: 'option-source',
    title: 'Option source',
    variants: [
      '?kind=fixed&total=10',
      '?kind=preloaded',
      '?kind=pages&total=60',
      '?kind=pages',
      '?kind=remote',
      '?kind=remote&total=45',
      '?kind=remote&selected=101,102,999',
      '?kind=remote&delay=1500',
      '?kind=preloaded&whole',
      '?kind=remote&whole',
    ],
    load: () =>
      import('./components/option-source-fixture').then(
        ({OptionSourceFixture}) => OptionSourceFixture,
      ),
  },
  {
    slug: 'form-policies',
    title: 'Form policies',
    variants: [
      '?errorDisplay=onChange',
      '?errorDisplay=onTouched',
      '?errorDisplay=onSubmit',
      '?isSaveSkipped',
    ],
    load: () =>
      import('./components/form-policies-fixture').then(
        ({FormPoliciesFixture}) => FormPoliciesFixture,
      ),
  },
  {
    slug: 'form-shells',
    title: 'Form shells',
    variants: [
      '?action=create',
      '?action=create&panelSize=lg',
      '?action=edit&id=2',
      '?action=invite&dialogSize=lg',
      '?tab=bildirim',
      '?hasManyTabs',
    ],
    load: () =>
      import('./components/form-shells-fixture').then(
        ({FormShellsFixture}) => FormShellsFixture,
      ),
  },
  {
    slug: 'alerts',
    title: 'Alerts',
    variants: [],
    load: () =>
      import('./components/alerts-fixture').then(
        ({AlertsFixture}) => AlertsFixture,
      ),
  },
  {
    slug: 'status-alerts',
    title: 'Status alerts',
    variants: [],
    load: () =>
      import('./components/status-alerts-fixture').then(
        ({StatusAlertsFixture}) => StatusAlertsFixture,
      ),
  },
  {
    slug: 'connectivity',
    title: 'Connectivity',
    variants: [],
    load: () =>
      import('./components/connectivity-fixture').then(
        ({ConnectivityFixture}) => ConnectivityFixture,
      ),
  },
  {
    slug: 'auto-animate',
    title: 'Auto animate',
    variants: ['?isPlugin'],
    load: () =>
      import('./components/auto-animate-fixture').then(
        ({AutoAnimateFixture}) => AutoAnimateFixture,
      ),
  },
  {
    slug: 'form-grid',
    title: 'Form grid',
    variants: [],
    load: () =>
      import('./components/form-grid-fixture').then(
        ({FormGridFixture}) => FormGridFixture,
      ),
  },
  {
    slug: 'theme',
    title: 'Theme',
    variants: [],
    load: () =>
      import('./components/theme-fixture').then(
        ({ThemeFixture}) => ThemeFixture,
      ),
  },
  {
    slug: 'boundaries',
    title: 'Boundaries',
    variants: ['?entity=', '?isErrorHandled'],
    load: () =>
      import('./components/boundaries-fixture').then(
        ({BoundariesFixture}) => BoundariesFixture,
      ),
  },
  {
    slug: 'app-error',
    title: 'App error',
    variants: [],
    load: () =>
      import('./components/app-error-fixture').then(
        ({AppErrorFixture}) => AppErrorFixture,
      ),
  },
  {
    slug: 'form-skeletons',
    title: 'Form skeletons',
    variants: [
      '?delay=800',
      '?delay=800&lead=group',
      '?delay=800&lead=disabled',
      '?delay=800&lead=checkbox',
      '?delay=800&lead=unmatched',
      '?delay=800&late',
    ],
    load: () =>
      import('./components/form-skeletons-fixture').then(
        ({FormSkeletonsFixture}) => FormSkeletonsFixture,
      ),
  },
  {
    slug: 'settings-layout',
    title: 'Settings layout',
    variants: ['?dirty=1', '?unsaved=1'],
    load: () =>
      import('./components/settings-layout-fixture').then(
        ({SettingsLayoutFixture}) => SettingsLayoutFixture,
      ),
  },
];
