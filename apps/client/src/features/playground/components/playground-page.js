'use client';

import {useState} from 'react';
import {toast} from 'react-toastify';
import {
  CircleAlertIcon,
  InfoIcon,
  SearchIcon,
  StarIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import {cn} from 'cn';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {AlertDialogMedia} from '@/components/ui/alert-dialog';
import {Avatar, AvatarFallback} from '@/components/ui/avatar';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Field, FieldLabel, FieldLegend, FieldSet} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {Spinner} from '@/components/ui/spinner';
import {Tabs, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {FullscreenSpinner} from '@/components/common/fullscreen-spinner';
import {LOADING_LABEL} from '@/components/common/loading-status';
import {useBusyStore} from '@/stores/busy-store';
import {appAlert} from '@/lib/app-alert';
import {useToastMutation} from '@/lib/query';

function delay(ms, {shouldFail = false} = {}) {
  return new Promise((resolve, reject) => {
    setTimeout(
      () =>
        shouldFail ? reject(new Error('Sunucu reddetti')) : resolve('tamam'),
      ms,
    );
  });
}

const APP_ALERTS = [
  {
    key: 'default',
    label: 'appAlert',
    run: () => appAlert('Düz uyarı', {description: 'İkon yok.'}),
  },
  {
    key: 'info',
    label: 'appAlert.info',
    run: () =>
      appAlert.info('Bilgilendirme', {description: 'Açıklama satırı.'}),
  },
  {
    key: 'success',
    label: 'appAlert.success',
    run: () => appAlert.success('Başarılı', {description: 'İşlem tamamlandı.'}),
  },
  {
    key: 'error',
    label: 'appAlert.error',
    run: () => appAlert.error('Hata', {description: 'İşlem tamamlanamadı.'}),
  },
  {
    key: 'warning',
    label: 'appAlert.warning',
    run: () =>
      appAlert.warning('Uyarı', {
        description: 'Dikkat edilmesi gereken durum.',
      }),
  },
  {
    key: 'confirm',
    label: 'appAlert.confirm',
    run: () => appAlert.confirm('Bu işlemi onaylıyor musunuz?'),
  },
  {
    key: 'dangerous',
    label: 'appAlert.confirmDangerous',
    run: () => appAlert.confirmDangerous('"örnek" kaydı silinsin mi?'),
  },
  {
    key: 'async-ok',
    label: 'confirmDangerous + onConfirm (başarılı)',
    run: () =>
      appAlert.confirmDangerous('Kayıt silinsin mi?', {
        description: 'Onaylayınca istek 1,5 sn sürecek.',
        onConfirm: () => delay(1500),
        pending: 'Siliniyor…',
        success: {render: ({data}) => `Kayıt silindi (${data})`},
        onSuccess: data => toast.info(`onSuccess: ${data}`),
        finally: () => toast.info('finally çalıştı'),
      }),
  },
  {
    key: 'async-fail',
    label: 'confirmDangerous + onConfirm (hatalı)',
    run: () =>
      appAlert.confirmDangerous('Kayıt silinsin mi?', {
        description: 'İstek hata verecek, sonuç diyaloğu açılacak.',
        onConfirm: () => delay(1500, {shouldFail: true}),
        pending: 'Siliniyor…',
        error: {
          render: ({cause}) => `Silinemedi: ${cause.message}`,
          description: 'Tekrar deneyebilirsiniz.',
        },
        onError: cause => toast.info(`onError: ${cause.message}`),
        finally: () => toast.info('finally çalıştı'),
      }),
  },
];

const TOASTS = [
  {key: 'default', label: 'toast', run: () => toast('Düz bildirim')},
  {key: 'info', label: 'toast.info', run: () => toast.info('Değişiklik yok')},
  {
    key: 'success',
    label: 'toast.success',
    run: () => toast.success('Kayıt oluşturuldu'),
  },
  {
    key: 'error',
    label: 'toast.error',
    run: () => toast.error('İşlem başarısız'),
  },
  {
    key: 'warning',
    label: 'toast.warning',
    run: () => toast.warning('Oturum yakında sona erecek'),
  },
  {
    key: 'promise-ok',
    label: 'useToastMutation (başarılı)',
    run: ({mutation}) => mutation.mutate({shouldFail: false}),
  },
  {
    key: 'promise-fail',
    label: 'useToastMutation (hatalı)',
    run: ({mutation}) => mutation.mutate({shouldFail: true}),
  },
];

const SURFACE_TOKENS = [
  'bg-background text-foreground',
  'bg-card text-card-foreground',
  'bg-popover text-popover-foreground',
  'bg-muted text-muted-foreground',
  'bg-accent text-accent-foreground',
  'bg-sidebar text-sidebar-foreground',
];

const SOLID_TOKENS = [
  'bg-primary text-primary-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-destructive text-destructive-foreground',
];

const OWN_SOLID_TOKENS = [
  'bg-success text-success-foreground',
  'bg-warning text-warning-foreground',
  'bg-blue text-white',
  'bg-sky text-black',
];

const CHART_TOKENS = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
];

const LINE_TOKENS = ['bg-border', 'bg-input', 'bg-ring'];

const BADGE_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'ghost',
  'link',
];

const OWN_BADGE_VARIANTS = ['success', 'warning', 'blue', 'sky'];

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'destructive',
  'ghost',
  'link',
];

const OWN_BUTTON_VARIANTS = ['success', 'warning', 'blue', 'sky'];

const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'];

const BUTTON_ICON_SIZES = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'];

const MEDIA_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'success',
  'warning',
  'blue',
  'sky',
];

const ADDON_ALIGNS = ['inline-start', 'inline-end', 'block-start', 'block-end'];

const SELECT_ITEMS = [
  {value: 'bir', label: 'bir'},
  {value: 'iki', label: 'iki'},
];

const SCROLL_LINES = Array.from(
  {length: 30},
  (unused, index) => `satır ${index + 1}`,
);

const SPINNER_SIZES = ['size-4', 'size-5', 'size-8', 'size-12', 'size-16'];

function Section({title, children}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function OwnSection({children}) {
  return (
    <>
      <Separator />
      <Section title="Bizim eklediklerimiz">{children}</Section>
    </>
  );
}

function TokenGrid({tokens}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {tokens.map(token => {
        const label = token
          .split(' ')
          .filter(name => !name.startsWith('text-'))
          .join(' ');
        return token.includes('text-') ? (
          <div
            key={token}
            className={cn(token, 'rounded-md border p-3 text-xs')}
          >
            {label}
          </div>
        ) : (
          <div key={token} className="flex flex-col gap-1">
            <div className={cn(token, 'h-10 rounded-md border')} />
            <span className="font-mono text-xs text-muted-foreground">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PlaygroundPage() {
  const demoMutation = useToastMutation({
    mutationFn: ({shouldFail}) => delay(1500, {shouldFail}),
    toast: {
      pending: 'Kaydediliyor…',
      success: {render: ({data}) => `Kaydedildi (${data})`},
      error: {render: ({data}) => data.message},
      finally: () => toast.info('finally çalıştı'),
    },
  });
  const [lastResult, setLastResult] = useState(null);
  const [fullscreenSpinner, setFullscreenSpinner] = useState(false);
  const busyCount = useBusyStore(state => state.count);
  const beginBusy = useBusyStore(state => state.begin);
  const endBusy = useBusyStore(state => state.end);

  const runDialog = async item => {
    const result = await item.run();
    setLastResult(`${item.label} → ${result}`);
  };

  const showFullscreenSpinner = () => {
    setFullscreenSpinner(true);
    setTimeout(() => setFullscreenSpinner(false), 2000);
  };

  const runBusy = () => {
    beginBusy();
    setTimeout(endBusy, 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Uygulama uyarıları</CardTitle>
          <CardDescription>
            Hepsi `lib/app-alert.js` üzerinden; dönen Promise&apos;in sonucu
            aşağıda görünür.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {APP_ALERTS.map(item => (
              <Button
                key={item.key}
                variant="outline"
                onClick={() => runDialog(item)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {lastResult ?? 'sonuç bekleniyor'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bildirimler</CardTitle>
          <CardDescription>
            react-toastify; renkleri `vendor-overrides/react-toastify.css`
            üzerinden temaya bağlı.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TOASTS.map(item => (
              <Button
                key={item.key}
                variant="outline"
                onClick={() => item.run({mutation: demoMutation})}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kaydırma solması</CardTitle>
          <CardDescription>
            `scroll-fade` — kutunun alt kenarında içeriğin devam ettiğini
            gösterir.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-48 scroll-fade overflow-y-auto">
          {SCROLL_LINES.map(line => (
            <div key={line} className="font-mono">
              {line}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spinner</CardTitle>
          <CardDescription>
            `ui/spinner.jsx`; varsayılan `size-4` ve rengi miras alır, o yüzden
            buton içinde ek sınıf gerekmez. Tam ekran perde ayrı bir bileşen:
            `FullscreenSpinner`.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-6">
            {SPINNER_SIZES.map(size => (
              <div key={size} className="flex flex-col items-center gap-2">
                <Spinner
                  aria-label={LOADING_LABEL}
                  className={cn(size, 'text-primary')}
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {size}
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <Button variant="destructive" disabled>
                <Spinner data-icon="inline-start" aria-label={LOADING_LABEL} />
                buton içinde
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                rengi miras alır
              </span>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={showFullscreenSpinner}>
              fullscreen (2 sn)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fetch göstergesi</CardTitle>
          <CardDescription>
            Ekranın en üstünde kayan ince çubuk. Bekleyen react-query
            sorgusu/mutasyonu ya da `stores/busy-store` sayacı tetikler. 200 ms
            gecikmeyle görünür; top-loader çalışırken kendini gizler.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={runBusy}>
            busy (2 sn)
          </Button>
          <Button variant="outline" onClick={beginBusy}>
            begin()
          </Button>
          <Button variant="outline" onClick={endBusy}>
            end()
          </Button>
          <span className="font-mono text-sm text-muted-foreground">
            count: {busyCount}
          </span>
        </CardContent>
      </Card>

      {fullscreenSpinner && <FullscreenSpinner />}

      <Card>
        <CardHeader>
          <CardTitle>Renk token&apos;ları</CardTitle>
          <CardDescription>
            Tema değiştiğinde tamamı takip etmeli. Aydınlık/karanlık düğmesiyle
            karşılaştır.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="Yüzeyler">
            <TokenGrid tokens={SURFACE_TOKENS} />
          </Section>
          <Section title="Dolu renkler">
            <TokenGrid tokens={SOLID_TOKENS} />
          </Section>
          <Section title="Grafik">
            <TokenGrid tokens={CHART_TOKENS} />
          </Section>
          <Section title="Çizgiler">
            <TokenGrid tokens={LINE_TOKENS} />
          </Section>
          <OwnSection>
            <TokenGrid tokens={OWN_SOLID_TOKENS} />
          </OwnSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rozetler</CardTitle>
          <CardDescription>
            Tek eksen: `variant`. Semantik renk de buraya giriyor, ayrı bir ton
            prop&apos;u yok.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="shadcn">
            <div className="flex flex-wrap items-center gap-2">
              {BADGE_VARIANTS.map(variant => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
          </Section>
          <OwnSection>
            <div className="flex flex-wrap items-center gap-2">
              {OWN_BADGE_VARIANTS.map(variant => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </div>
          </OwnSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Butonlar</CardTitle>
          <CardDescription>
            İki eksen çarpıştığı için `cva`&apos;nın gerçekten gerekli olduğu
            tek bileşen. Semantik varyantlar `destructive`&apos;in sekiz
            bildirimini birebir aynalıyor — taban, metin, hover, focus kenarı ve
            halkası, artı dark karşılıkları.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="variant">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_VARIANTS.map(variant => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
            </div>
          </Section>
          <OwnSection>
            <div className="flex flex-wrap items-center gap-2">
              {OWN_BUTTON_VARIANTS.map(variant => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
            </div>
          </OwnSection>
          <Separator />
          <Section title="size">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_SIZES.map(size => (
                <Button key={size} variant="outline" size={size}>
                  {size}
                </Button>
              ))}
              {BUTTON_ICON_SIZES.map(size => (
                <Button
                  key={size}
                  variant="outline"
                  size={size}
                  aria-label={size}
                >
                  <StarIcon />
                </Button>
              ))}
            </div>
          </Section>
          <Section title="durum">
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled>disabled</Button>
              <Button variant="destructive" disabled>
                destructive disabled
              </Button>
              <Button aria-invalid="true">aria-invalid</Button>
              <Button variant="outline">
                <Spinner data-icon="inline-start" aria-label={LOADING_LABEL} />
                yükleniyor
              </Button>
            </div>
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uyarı kutusu</CardTitle>
          <CardDescription>
            shadcn&apos;in `destructive`&apos;i ve onu izleyen `warning`
            bilinçli olarak tint taşımıyor — kart zemini + durum renginde metin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Alert>
            <InfoIcon />
            <AlertTitle>default</AlertTitle>
            <AlertDescription>Nötr bilgilendirme satırı.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>destructive</AlertTitle>
            <AlertDescription>Hata açıklaması.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>warning</AlertTitle>
            <AlertDescription>Uyarı açıklaması.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diyalog ikon kutusu</CardTitle>
          <CardDescription>
            `AlertDialogMedia`&apos;nın `variant` ekseni tamamen bizim —
            shadcn&apos;de bu bileşenin varyantı yok. `AppAlertContainer` uyarı
            türünü buna eşliyor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnSection>
            <div className="flex flex-wrap items-center gap-3">
              {MEDIA_VARIANTS.map(variant => (
                <div key={variant} className="flex items-center gap-2">
                  <AlertDialogMedia variant={variant} className="mb-0">
                    <CircleAlertIcon />
                  </AlertDialogMedia>
                  <span className="font-mono text-xs text-muted-foreground">
                    {variant}
                  </span>
                </div>
              ))}
            </div>
          </OwnSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sekmeler</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="variant=default">
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">bir</TabsTrigger>
                <TabsTrigger value="b">iki</TabsTrigger>
              </TabsList>
            </Tabs>
          </Section>
          <Section title="variant=line">
            <Tabs defaultValue="a">
              <TabsList variant="line">
                <TabsTrigger value="a">bir</TabsTrigger>
                <TabsTrigger value="b">iki</TabsTrigger>
              </TabsList>
            </Tabs>
          </Section>
          <Section title="orientation=vertical">
            <Tabs defaultValue="a" orientation="vertical">
              <TabsList>
                <TabsTrigger value="a">bir</TabsTrigger>
                <TabsTrigger value="b">iki</TabsTrigger>
              </TabsList>
            </Tabs>
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menü öğesi</CardTitle>
          <CardDescription>
            `DropdownMenuItem` da `variant` ile `destructive` alıyor; tint
            yalnız `focus` hâlinde beliriyor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              menüyü aç
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuItem>default</DropdownMenuItem>
                <DropdownMenuItem variant="destructive">
                  destructive
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Girdi eklentisi</CardTitle>
          <CardDescription>
            `InputGroupAddon`, `align` ekseniyle dört kenara yerleşiyor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {ADDON_ALIGNS.map(align => (
            <InputGroup key={align}>
              <InputGroupInput placeholder={align} />
              <InputGroupAddon align={align}>
                <SearchIcon />
              </InputGroupAddon>
            </InputGroup>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boyut eksenleri</CardTitle>
          <CardDescription>
            `data-size` ile sürülen bileşenler. Hepsi shadcn&apos;den.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="Avatar">
            <div className="flex items-center gap-3">
              {['sm', 'default', 'lg'].map(size => (
                <Avatar key={size} size={size}>
                  <AvatarFallback>{size[0].toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </Section>
          <Section title="SelectTrigger">
            <div className="flex flex-wrap items-center gap-3">
              {['sm', 'default'].map(size => (
                <Select key={size} items={SELECT_ITEMS} defaultValue="bir">
                  <SelectTrigger size={size}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {SELECT_ITEMS.map(item => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ))}
            </div>
          </Section>
          <Section title="Card">
            <div className="grid gap-3 md:grid-cols-2">
              {['default', 'sm'].map(size => (
                <Card key={size} size={size}>
                  <CardHeader>
                    <CardTitle>size={size}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">İçerik satırı.</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alan yerleşimi</CardTitle>
          <CardDescription>
            `Field`&apos;ın `orientation` ekseni ve `FieldLegend`&apos;in
            `variant`&apos;ı. Form kiti bunların üzerine kuruluyor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {['vertical', 'horizontal', 'responsive'].map(orientation => (
            <Section key={orientation} title={`orientation=${orientation}`}>
              <Field orientation={orientation}>
                <FieldLabel htmlFor={`f-${orientation}`}>Etiket</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`f-${orientation}`}
                    placeholder={orientation}
                  />
                </InputGroup>
              </Field>
            </Section>
          ))}
          <Section title="FieldLegend variant">
            <FieldSet>
              <FieldLegend variant="legend">legend</FieldLegend>
              <FieldLegend variant="label">label</FieldLegend>
            </FieldSet>
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ayraç</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Section title="orientation=horizontal">
            <Separator />
          </Section>
          <Section title="orientation=vertical">
            <div className="flex h-10 items-center gap-3">
              <span className="text-sm text-muted-foreground">sol</span>
              <Separator orientation="vertical" />
              <span className="text-sm text-muted-foreground">sağ</span>
            </div>
          </Section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kart başlığı ayracı</CardTitle>
          <CardDescription>
            `CardHeader`&apos;ın `hasDivider` prop&apos;u bizim; shadcn&apos;de
            karşılığı elle `className=&quot;border-b&quot;` yazmak.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnSection>
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>hasDivider (varsayılan)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Başlığın altında çizgi var.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader hasDivider={false}>
                  <CardTitle>hasDivider={'{false}'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Çizgi ve onunla gelen dolgu kalkıyor.
                  </p>
                </CardContent>
              </Card>
            </div>
          </OwnSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diyalog konumu</CardTitle>
          <CardDescription>
            `DialogContent`&apos;in `position` prop&apos;u bizim. Dikey
            ortalamayı iptal eden iki değer yüksekliği de sınırlayıp kaydırıyor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OwnSection>
            <div className="flex flex-wrap items-center gap-2">
              {['center', 'top', 'bottom'].map(position => (
                <Dialog key={position}>
                  <DialogTrigger render={<Button variant="outline" />}>
                    position={position}
                  </DialogTrigger>
                  <DialogContent position={position}>
                    <DialogHeader>
                      <DialogTitle>position={position}</DialogTitle>
                      <DialogDescription>
                        {SCROLL_LINES.slice(0, 12).join(' · ')}
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </OwnSection>
        </CardContent>
      </Card>
    </div>
  );
}
