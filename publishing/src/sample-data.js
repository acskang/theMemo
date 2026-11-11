export const defaultNotebooks = [
  { id: 'daily', name: '일상 기록' }, { id: 'dev', name: '개발 노트' },
  { id: 'idea', name: '아이디어' }, { id: 'reading', name: '읽고 배운 것' },
];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function newDocument() { return { type: 'doc', content: [{ type: 'paragraph' }] }; }
export const p = text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });
const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const task = (text, checked) => ({ type: 'taskItem', attrs: { checked }, content: [p(text)] });
export function sampleNotes(assetBase) {
  const today = new Date(); const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const earlier = new Date(today); earlier.setDate(earlier.getDate() - 2);
  const make = (id, title, notebook_id, tags, content, date, favorite = false) => ({
    id, title, notebook_id, tags, content: { type: 'doc', content }, document_date: localDate(date),
    favorite, deleted: false, is_public: false, revision: 1, schema_version: 1, icon: '', cover: null,
    created_at: date.toISOString(), updated_at: date.toISOString(), plain_text: '', daily_key: null,
  });
  return [
    make('welcome', '오늘, 스마트메모를 시작하다', 'daily', ['일상', '생각'], [
      p('흩어져 있던 생각을 한곳에 모으기로 했다.'),
      p('완벽한 글이 아니어도 괜찮다. 오늘의 순간부터 천천히 기록해 보자.'),
      heading('오늘 기억하고 싶은 것'),
      { type: 'blockquote', content: [p('작은 기록이 쌓여, 나만의 이야기가 된다.')] },
      { type: 'taskList', content: [task('떠오른 생각을 바로 메모하기', true), task('사진 한 장과 함께 오늘을 남기기', false)] },
      { type: 'image', attrs: { src: `${assetBase}river.png`, alt: '가을 저녁 한강 산책로와 강 건너 도시의 불빛', caption: '잠깐의 산책, 오래 남길 순간', width: '100%' } },
      heading('내일의 나에게'), p('오늘의 속도로, 한 줄씩 이어가자.'),
    ], today, true),
    make('ideas', '만들고 싶은 것들을 적어 두다', 'idea', ['아이디어'], [
      p('생각이 떠오를 때, 잊기 전에 한 줄부터.'), heading('기록을 더 쉽게'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('휴대폰에서도 바로 작성할 수 있게')] }, { type: 'listItem', content: [p('나중에 찾기 쉬운 메모장과 태그')] }] },
    ], yesterday),
    make('dev-note', '작게 만들고, 매일 개선하기', 'dev', ['개발', 'Django'], [
      p('작은 기능 하나를 끝까지 완성한 다음, 다음 단계로 넘어가자.'), heading('오늘의 개발 메모'),
      { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'def remember(thought):\n    return save(thought)' }] },
      p('화면과 데이터 연결은 서로 독립적으로 확인하기.'),
    ], earlier, true),
  ];
}
