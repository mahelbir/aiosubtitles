export function toSrt(cueTexts) {
  return cueTexts
    .map((cueText, cueIndex) => {
      const startSecond = String(cueIndex * 4 + 1).padStart(2, '0');
      const endSecond = String(cueIndex * 4 + 3).padStart(2, '0');
      return `${cueIndex + 1}\n00:00:${startSecond},000 --> 00:00:${endSecond},000\n${cueText}\n`;
    })
    .join('\n');
}

export const TURKISH_SRT = toSrt([
  'Bu akşam eve erken dönmem gerekiyor.',
  'Annem yemeği çoktan hazırlamış olmalı.',
  'Yarın sabah toplantıya geç kalmayalım.',
  'Kapıyı kapatmayı unutma lütfen.',
  'Hava bugün oldukça soğuk görünüyor.',
  'Çocuklar bahçede oyun oynuyorlar.',
  'Kitabı masanın üstüne bıraktım.',
  'Bu yolu daha önce hiç görmemiştim.',
  'Telefonun şarjı neredeyse bitti.',
  'Kahve içmek ister misin benimle?',
  'Şehrin ışıkları uzaktan görünüyor.',
  'Üşüdüğünü söyleme, ceketini giy.',
]);

export const OTHER_TURKISH_SRT = toSrt([
  'Gemi limana sabah erkenden yanaştı.',
  'Kaptan tayfaya yeni emirler verdi.',
  'Denizin rengi bugün çok farklıydı.',
  'Martılar direklerin üstünde bekliyordu.',
  'Yolcular güverteye çıkmak için sıraya girdi.',
  'Fırtına gece boyunca hiç dinmedi.',
  'Pusulayı kamaradaki çekmecede buldum.',
  'Haritada bu adayı hiç görmemiştik.',
  'Erzak bir hafta daha yetecek gibi.',
  'Rüzgâr yönünü kuzeye doğru çevirdi.',
  'Fener ışığı ufukta belirdi sonunda.',
  'Herkes kıyıya ayak basınca sevindi.',
]);
