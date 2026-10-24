// The theme gallery's pages (/themes/ and /themes/<id>/), made by the build
// (build/gallery.js) from sshterm-themes. The pages are written in English;
// this fills in the reader's language and, on the list, filters the themes by
// name and by a dark or light background, inside the page. Theme names and
// authors are never translated. It stores nothing and loads nothing else.

import { localize, pickLang } from '../common.js';
import { nameKey } from '../theme-format.js';

export const STRINGS = {
  en: {
    htmlLang: 'en',
    title: 'SSH Term themes',
    intro: 'Terminal color themes that SSH Term users made and sent. Open one on your phone to add it to SSH Term.',
    search: 'Name',
    tone: 'Background',
    toneAll: 'All',
    toneDark: 'Dark',
    toneLight: 'Light',
    noMatch: 'No theme matches.',
    empty: 'No themes yet.',
    sendTitle: 'Send your theme',
    send: 'Make a theme in SSH Term, export it and send it as a pull request to the sshterm-themes repository on GitHub. It shows here after a check and a review.',
    sendLink: 'How to send a theme',
    takedownTitle: 'Taking a theme down',
    takedown: 'To have a theme taken down, open an issue in sshterm-themes. Taking it down removes it from this site only: a theme link carries the whole theme, so themes already added to SSH Term and links already shared stay.',
    takedownLink: 'Ask to take a theme down',
    formatLink: 'The theme file format',
    back: 'All themes',
    author: 'Author',
    license: 'License',
    basedOn: 'Based on',
    sentBy: 'Sent by GitHub account',
    open: 'Open in SSH Term',
    qr: 'Scan with your phone’s camera to open the theme in SSH Term.',
    download: 'Download the theme file (JSON)',
  },
  ja: {
    htmlLang: 'ja',
    title: 'SSH Term のテーマ',
    intro: 'SSH Term の利用者が作って投稿したターミナルの配色テーマです。スマホで開くと、SSH Term にテーマを追加できます。',
    search: '名前',
    tone: '背景',
    toneAll: 'すべて',
    toneDark: 'ダーク',
    toneLight: 'ライト',
    noMatch: '当てはまるテーマはありません。',
    empty: 'テーマはまだありません。',
    sendTitle: 'テーマを投稿する',
    send: 'SSH Term でテーマを作って書き出し、GitHub の sshterm-themes リポジトリにプルリクエストで送ってください。検査とレビューのあと、ここに載ります。',
    sendLink: '投稿のしかた',
    takedownTitle: 'テーマの取り下げ',
    takedown: 'テーマを取り下げるには、sshterm-themes に Issue を作ってください。取り下げで消えるのはこのサイトへの掲載だけです。テーマのリンクはテーマをまるごと運ぶので、すでに SSH Term に入ったテーマと共有済みのリンクはそのまま残ります。',
    takedownLink: '取り下げを依頼する',
    formatLink: 'テーマのファイル形式',
    back: 'テーマの一覧',
    author: '作者',
    license: 'ライセンス',
    basedOn: '元にしたテーマ',
    sentBy: '投稿した GitHub アカウント',
    open: 'SSH Term で開く',
    qr: 'スマホのカメラで読み取ると、SSH Term でテーマを開けます。',
    download: 'テーマのファイル（JSON）をダウンロード',
  },
  ko: {
    htmlLang: 'ko',
    title: 'SSH Term 테마',
    intro: 'SSH Term 사용자가 만들어 보낸 터미널 색상 테마입니다. 휴대폰에서 열면 SSH Term에 테마를 추가할 수 있습니다.',
    search: '이름',
    tone: '배경',
    toneAll: '전체',
    toneDark: '다크',
    toneLight: '라이트',
    noMatch: '일치하는 테마가 없습니다.',
    empty: '아직 테마가 없습니다.',
    sendTitle: '테마 보내기',
    send: 'SSH Term에서 테마를 만들어 내보낸 뒤, GitHub의 sshterm-themes 저장소에 풀 리퀘스트로 보내 주세요. 검사와 리뷰를 거친 뒤 여기에 게시됩니다.',
    sendLink: '테마를 보내는 방법',
    takedownTitle: '테마 내리기',
    takedown: '테마를 내리려면 sshterm-themes에 이슈를 만들어 주세요. 내려도 이 사이트에서만 사라집니다. 테마 링크는 테마 전체를 담고 있으므로, 이미 SSH Term에 추가된 테마와 공유된 링크는 그대로 남습니다.',
    takedownLink: '테마 내리기 요청',
    formatLink: '테마 파일 형식',
    back: '모든 테마',
    author: '작성자',
    license: '라이선스',
    basedOn: '원본 테마',
    sentBy: '보낸 GitHub 계정',
    open: 'SSH Term에서 열기',
    qr: '휴대폰 카메라로 스캔하면 SSH Term에서 테마를 열 수 있습니다.',
    download: '테마 파일(JSON) 다운로드',
  },
  zh: {
    htmlLang: 'zh-Hans',
    title: 'SSH Term 主题',
    intro: '由 SSH Term 用户制作并投稿的终端配色主题。在手机上打开，即可将主题添加到 SSH Term。',
    search: '名称',
    tone: '背景',
    toneAll: '全部',
    toneDark: '深色',
    toneLight: '浅色',
    noMatch: '没有匹配的主题。',
    empty: '还没有主题。',
    sendTitle: '投稿主题',
    send: '在 SSH Term 中制作并导出主题，然后通过拉取请求提交到 GitHub 上的 sshterm-themes 仓库。经过检查和审核后，主题会显示在这里。',
    sendLink: '如何投稿主题',
    takedownTitle: '撤下主题',
    takedown: '如需撤下主题，请在 sshterm-themes 中创建 Issue。撤下只会将主题从本网站移除。主题链接包含完整的主题，因此已添加到 SSH Term 的主题和已分享的链接仍会保留。',
    takedownLink: '申请撤下主题',
    formatLink: '主题文件格式',
    back: '所有主题',
    author: '作者',
    license: '许可证',
    basedOn: '基于主题',
    sentBy: '投稿的 GitHub 账号',
    open: '在 SSH Term 中打开',
    qr: '用手机相机扫描，即可在 SSH Term 中打开主题。',
    download: '下载主题文件（JSON）',
  },
  zh_Hant: {
    htmlLang: 'zh-Hant',
    title: 'SSH Term 主題',
    intro: '由 SSH Term 使用者製作並投稿的終端機配色主題。在手機上開啟，即可將主題加入 SSH Term。',
    search: '名稱',
    tone: '背景',
    toneAll: '全部',
    toneDark: '深色',
    toneLight: '淺色',
    noMatch: '沒有符合的主題。',
    empty: '還沒有主題。',
    sendTitle: '投稿主題',
    send: '在 SSH Term 中製作並匯出主題，然後透過提取要求提交到 GitHub 上的 sshterm-themes 儲存庫。經過檢查和審核後，主題會顯示在這裡。',
    sendLink: '如何投稿主題',
    takedownTitle: '撤下主題',
    takedown: '如需撤下主題，請在 sshterm-themes 中建立 Issue。撤下只會將主題從本網站移除。主題連結包含完整的主題，因此已加入 SSH Term 的主題和已分享的連結仍會保留。',
    takedownLink: '申請撤下主題',
    formatLink: '主題檔案格式',
    back: '所有主題',
    author: '作者',
    license: '授權',
    basedOn: '基於主題',
    sentBy: '投稿的 GitHub 帳號',
    open: '在 SSH Term 中開啟',
    qr: '用手機相機掃描，即可在 SSH Term 中開啟主題。',
    download: '下載主題檔案（JSON）',
  },
};

/**
 * Whether the list shows a theme ({name, tone: 'dark' | 'light'}) for the
 * filters ({query, tone: '' (any) | 'dark' | 'light'}): the tone matches and
 * the name contains the query, compared as nameKey does.
 */
export function shows(theme, { query, tone }) {
  if (tone && theme.tone !== tone) return false;
  const q = nameKey(query.trim());
  return q === '' || nameKey(theme.name).includes(q);
}

/** Localizes the page and, on the list, turns on the filters. */
export function main(env = globalThis) {
  const { document: doc, navigator } = env;
  localize(STRINGS[pickLang(navigator.language, STRINGS)], doc);
  const filters = doc.getElementById('filters');
  if (!filters) return;
  const query = doc.getElementById('q');
  const tones = [...filters.querySelectorAll('input[name="tone"]')];
  const cards = [...doc.querySelectorAll('#themes > li')];
  const apply = () => {
    const tone = tones.find((radio) => radio.checked)?.value ?? '';
    let shown = 0;
    for (const card of cards) {
      const theme = { name: card.querySelector('.name').textContent, tone: card.dataset.tone };
      card.hidden = !shows(theme, { query: query.value, tone });
      if (!card.hidden) shown++;
    }
    doc.getElementById('none').hidden = shown > 0;
  };
  query.addEventListener('input', apply);
  for (const radio of tones) radio.addEventListener('change', apply);
  filters.hidden = false;
  apply();
}

if (typeof document !== 'undefined') main();
