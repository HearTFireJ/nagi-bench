// 全片语音 cue 清单（唯一来源）。
// 全部“待配音内容”都只以字幕形式呈现（不生成/合成任何人声）；字幕由播放器直接读取本清单渲染为
// 画面底部居中的「【说话者】文本」。后期可按 id 逐条配音、接入。
// 每条固定七个字段：id / kind / speaker / text / delivery / start / end（时间单位：秒，绝对时间轴）。
import type { VoiceCue } from "@agentbench/cinematic-player";
import { T } from "../film/timing";

const at = (base: number, s: number): number => Math.round((base + s) * 100) / 100;

export const voiceCues: VoiceCue[] = [
  // ───────────── 序：日落前 ─────────────
  {
    id: "vc-001", kind: "monologue", speaker: "章北海",
    text: "没有从哪里来，也不想到哪里去，只是存在着。",
    delivery: "低沉、平静的男声，像在自言自语；语速很慢，句间留出空白",
    start: at(T.open, 1.2), end: at(T.open, 5.6),
  },
  {
    id: "vc-002", kind: "monologue", speaker: "章北海",
    text: "我喜欢这种感觉。父亲的在天之灵，大概也是这样。",
    delivery: "低沉、平静的男声，像在自言自语，声音比上一句更轻，带一点难以察觉的暖意；“父亲”二字略停",
    start: at(T.open, 9.4), end: at(T.open, 14.0),
  },

  // ───────────── 第一幕：胡同深处的四合院 ─────────────
  {
    id: "vc-003", kind: "monologue", speaker: "章北海",
    text: "四个月前。",
    delivery: "低沉平静，像翻开一页档案，语速平稳",
    start: at(T.courtyard, 0.4), end: at(T.courtyard, 1.7),
  },
  {
    id: "vc-004", kind: "broadcast", speaker: "广播",
    text: "太空电梯全线贯通，可控核聚变取得突破。",
    delivery: "邻家窗户里传出的老式收音机播音腔，声音发闷、略带电流噪声，字正腔圆、语速平稳",
    start: at(T.courtyard, 2.3), end: at(T.courtyard, 5.9),
  },
  {
    id: "vc-005", kind: "dialogue", speaker: "收藏者",
    text: "来啦！快请进！",
    delivery: "五十多岁男声，热情洪亮，带着被打断专注后的欣喜，尾音上扬",
    start: at(T.courtyard, 12.6), end: at(T.courtyard, 14.4),
  },
  {
    id: "vc-006", kind: "monologue", speaker: "章北海",
    text: "有些人，守着自己的小世界，不管外面怎样变，都能自得其乐。",
    delivery: "低沉平静的内心独白；语速缓慢，“小世界”“自得其乐”略微放慢，带一点羡慕",
    start: at(T.courtyard, 19.2), end: at(T.courtyard, 24.6),
  },
  {
    id: "vc-007", kind: "monologue", speaker: "章北海",
    text: "这让我觉得，温暖，踏实。",
    delivery: "低沉、平静的内心独白，声音更轻，几乎是叹息；“温暖”与“踏实”之间留一拍",
    start: at(T.courtyard, 25.0), end: at(T.courtyard, 27.4),
  },
  {
    id: "vc-008", kind: "dialogue", speaker: "收藏者",
    text: "您是军人吧？一眼就看得出来。",
    delivery: "随意、笃定的语气，带笑，端着茶壶时说的",
    start: at(T.courtyard, 29.0), end: at(T.courtyard, 31.6),
  },
  {
    id: "vc-009", kind: "dialogue", speaker: "章北海",
    text: "您也曾经是。",
    delivery: "平静克制，陈述句，不带疑问，嘴角几乎没有变化",
    start: at(T.courtyard, 32.0), end: at(T.courtyard, 33.4),
  },
  {
    id: "vc-010", kind: "dialogue", speaker: "收藏者",
    text: "好眼力。总参测绘局，大半辈子。",
    delivery: "爽朗，略带得意；“大半辈子”有一丝怀念",
    start: at(T.courtyard, 33.8), end: at(T.courtyard, 36.4),
  },
  {
    id: "vc-011", kind: "dialogue", speaker: "章北海",
    text: "怎么会喜欢上陨石？",
    delivery: "平静、真诚的好奇，语速稍慢",
    start: at(T.courtyard, 36.9), end: at(T.courtyard, 38.5),
  },
  {
    id: "vc-012", kind: "dialogue", speaker: "收藏者",
    text: "每拿到一块，就像去了一个外星世界。",
    delivery: "眼睛发亮的语气，语速渐快，“外星世界”带着孩子般的兴奋",
    start: at(T.courtyard, 38.8), end: at(T.courtyard, 42.0),
  },
  {
    id: "vc-013", kind: "dialogue", speaker: "章北海",
    text: "地球就是一块大陨石。我手里的茶杯，也是。",
    delivery: "平静、一本正经，像在陈述事实；最后三个字略带一丝几乎看不见的幽默",
    start: at(T.courtyard, 42.6), end: at(T.courtyard, 46.4),
  },
  {
    id: "vc-014", kind: "dialogue", speaker: "收藏者",
    text: "呵呵，你已经开始砍价了。",
    delivery: "先是一声开怀的“呵呵”，再半开玩笑地指点对方，带笑意",
    start: at(T.courtyard, 46.8), end: at(T.courtyard, 49.2),
  },
  {
    id: "vc-015", kind: "dialogue", speaker: "收藏者",
    text: "这块来自火星，指甲盖大小。",
    delivery: "放低声音、郑重，像在介绍传家宝",
    start: at(T.courtyard, 51.0), end: at(T.courtyard, 53.4),
  },
  {
    id: "vc-016", kind: "dialogue", speaker: "收藏者",
    text: "五年前，有人出黄金一千倍的价钱，我没答应。",
    delivery: "画外音式的自豪，语速平稳，“我没答应”一字一顿",
    start: at(T.courtyard, 57.8), end: at(T.courtyard, 61.8),
  },
  {
    id: "vc-017", kind: "dialogue", speaker: "章北海",
    text: "比重大，受冲击不易破碎，最好能上车床。",
    delivery: "平静、精确的技术口吻，像在报规格，不带任何多余情绪",
    start: at(T.courtyard, 64.8), end: at(T.courtyard, 68.0),
  },
  {
    id: "vc-018", kind: "dialogue", speaker: "收藏者",
    text: "那就是铁陨石了。",
    delivery: "恍然大悟的轻快，边说边转身去开柜子",
    start: at(T.courtyard, 68.3), end: at(T.courtyard, 69.9),
  },
  {
    id: "vc-019", kind: "dialogue", speaker: "章北海",
    text: "这样大小的，要三块。",
    delivery: "简短、不容商量的平静",
    start: at(T.courtyard, 73.0), end: at(T.courtyard, 74.9),
  },
  {
    id: "vc-020", kind: "dialogue", speaker: "收藏者",
    text: "每块六万，三块十八万。",
    delivery: "先试探再报价，语气小心，最后一个数字略微放轻",
    start: at(T.courtyard, 75.3), end: at(T.courtyard, 77.3),
  },
  {
    id: "vc-021", kind: "dialogue", speaker: "章北海",
    text: "给个账号，我现在就付款。",
    delivery: "干脆利落，没有任何停顿或犹豫",
    start: at(T.courtyard, 77.7), end: at(T.courtyard, 79.9),
  },
  {
    id: "vc-022", kind: "dialogue", speaker: "收藏者",
    text: "其实……我是准备你还价的。",
    delivery: "尴尬地笑，语速迟疑，“其实”后停顿，像被将了一军",
    start: at(T.courtyard, 80.3), end: at(T.courtyard, 82.9),
  },
  {
    id: "vc-023", kind: "dialogue", speaker: "章北海",
    text: "不。就这个价，算是我对要送的人的尊重。",
    delivery: "低沉、诚恳，“不”字干净；最后半句放慢，字字落地，带着只有观众之后才会明白的重量",
    start: at(T.courtyard, 83.3), end: at(T.courtyard, 86.9),
  },

  // ───────────── 第二幕：制作 ─────────────
  {
    id: "vc-024", kind: "monologue", speaker: "章北海",
    text: "这种胶，是用来修补太空舱外壳的——冷热交替，也不会失效。",
    delivery: "冷静、精确，像在做技术备忘；破折号处略停顿，“太空舱”三字压低",
    start: at(T.making, 30.6), end: at(T.making, 35.4),
  },
  {
    id: "vc-025", kind: "monologue", speaker: "章北海",
    text: "碎成粉了。看不出一点加工的痕迹。",
    delivery: "低声、满意但不露声色；说完轻轻合拢手掌",
    start: at(T.making, 53.8), end: at(T.making, 56.2),
  },

  // ───────────── 过渡：一号基地 ─────────────
  {
    id: "vc-026", kind: "monologue", speaker: "章北海",
    text: "定位单元留在舱里。这一次外出，不会留下任何记录。",
    delivery: "低沉平静，像在核对一份清单；“不会留下任何记录”放慢、压低",
    start: at(T.transit, 1.0), end: at(T.transit, 5.4),
  },

  // ───────────── 第三幕：太空 ─────────────
  {
    id: "vc-027", kind: "monologue", speaker: "章北海",
    text: "会议结束了。会后，全体与会者都要出舱合影，这是惯例。",
    delivery: "低沉平静的内心独白，像在陈述一份早已算好的时刻表；“这是惯例”略微放轻",
    start: at(T.space, 0.6), end: at(T.space, 5.6),
  },
  {
    id: "vc-028", kind: "monologue", speaker: "章北海",
    text: "航天服只能撑十二个小时。我必须在那之前，回到八十公里外的一号基地。",
    delivery: "低沉平静的内心独白，语速略快，带一点被空旷压出来的冷静；“八十公里”放慢",
    start: at(T.space, 9.8), end: at(T.space, 16.6),
  },
  {
    id: "vc-029", kind: "radio", speaker: "黄河站调度",
    text: "出舱合影队，气闸窗口开放，周边人员请避让。",
    delivery: "无线电调度员的公事腔，字正腔圆、略带电流声，语速平稳，句尾利落收住",
    start: at(T.space, 18.6), end: at(T.space, 22.6),
  },
  {
    id: "vc-030", kind: "radio", speaker: "摄影师",
    text: "各位向左靠一点，前排的首长站中间。",
    delivery: "年轻男声，轻快、带笑，通过头盔无线电传来，略有失真",
    start: at(T.space, 32.0), end: at(T.space, 35.4),
  },
  {
    id: "vc-031", kind: "radio", speaker: "摄影师",
    text: "推进器的白雾还没散，都别动，等一下。",
    delivery: "年轻男声，通过头盔无线电传来，略有失真；稍微提高音量招呼大家，语气耐心",
    start: at(T.space, 36.2), end: at(T.space, 39.4),
  },
  {
    id: "vc-032", kind: "radio", speaker: "摄影师",
    text: "太阳快落了，都把面罩调成透明！",
    delivery: "年轻男声，通过头盔无线电传来，略有失真；带着催促的兴奋",
    start: at(T.space, 43.8), end: at(T.space, 46.6),
  },
  {
    id: "vc-033", kind: "chatter", speaker: "老院士",
    text: "三十年前，我们连一间像样的试验室都没有。",
    delivery: "七十岁上下的男声，沙哑、缓慢，带着感慨与自豪，通过无线电传来",
    start: at(T.space, 47.4), end: at(T.space, 51.0),
  },
  {
    id: "vc-034", kind: "chatter", speaker: "女总工",
    text: "现在倒好，有了一整座站。",
    delivery: "五十多岁的女声，干练、带一点打趣的笑意",
    start: at(T.space, 51.6), end: at(T.space, 54.0),
  },
  {
    id: "vc-035", kind: "chatter", speaker: "总设计师",
    text: "别感慨了，拍照，拍照！",
    delivery: "浑厚的男声，故作嫌弃地催促，笑着",
    start: at(T.space, 54.6), end: at(T.space, 56.8),
  },
  {
    id: "vc-036", kind: "monologue", speaker: "章北海",
    text: "他们用那样微薄的投入，如履薄冰，打开了太空时代的黎明。",
    delivery: "低沉、平静，像在读一份不得不写的鉴定；“如履薄冰”一字一顿",
    start: at(T.space, 57.6), end: at(T.space, 63.0),
  },
  {
    id: "vc-037", kind: "monologue", speaker: "章北海",
    text: "可正是那段经历，禁锢了他们的思想。",
    delivery: "低沉、平静的男声，像在读一份鉴定；声音更冷，没有任何起伏",
    start: at(T.space, 63.4), end: at(T.space, 66.6),
  },
  {
    id: "vc-038", kind: "monologue", speaker: "章北海",
    text: "取枪，装镜，换弹夹——在失重里，练了三个月。",
    delivery: "低声、克制，像在数自己的动作；破折号处停顿半拍",
    start: at(T.space, 67.0), end: at(T.space, 71.6),
  },
  {
    id: "vc-039", kind: "monologue", speaker: "章北海",
    text: "枪和弹夹，不能在外面冻太久。",
    delivery: "低声、克制的男声，短促、务实，像在自查一份检查单",
    start: at(T.space, 72.0), end: at(T.space, 74.8),
  },
  {
    id: "vc-040", kind: "monologue", speaker: "章北海",
    text: "在地球上，最好的狙击枪也打不到五千米。",
    delivery: "低沉、平静的陈述，像在念一条物理定律",
    start: at(T.space, 76.4), end: at(T.space, 80.4),
  },
  {
    id: "vc-041", kind: "monologue", speaker: "章北海",
    text: "但在太空里，一支普通手枪就够了。",
    delivery: "低沉、平静的陈述，声音压得更低，几乎听不见的一点冷意",
    start: at(T.space, 80.8), end: at(T.space, 84.4),
  },
  {
    id: "vc-042", kind: "monologue", speaker: "章北海",
    text: "无辜？他要杀的这三个人，也是无辜的。",
    delivery: "自问自答；“无辜”上扬一个疑问，随后整句沉下去，带着极轻的痛",
    start: at(T.space, 85.0), end: at(T.space, 89.0),
  },
  {
    id: "vc-043", kind: "monologue", speaker: "章北海",
    text: "可为了得到能飞向恒星的飞船，必须消灭他们。",
    delivery: "低沉而坚定，最后四个字咬得清晰、不容置疑",
    start: at(T.space, 89.6), end: at(T.space, 94.6),
  },
  {
    id: "vc-044", kind: "monologue", speaker: "章北海",
    text: "他们的死，也算是为太空事业做的最后一次贡献。",
    delivery: "声音几乎是耳语，平静得可怕；说完屏住呼吸",
    start: at(T.space, 95.0), end: at(T.space, 100.4),
  },
  {
    id: "vc-045", kind: "radio", speaker: "摄影师",
    text: "好——都看这边！三、二、一——",
    delivery: "明快的倒计时，笑意盈盈，每个数字之间留出拍照前的停顿",
    start: at(T.space, 104.2), end: at(T.space, 108.0),
  },
  {
    id: "vc-046", kind: "chatter", speaker: "合影者",
    text: "陨石雨！",
    delivery: "多人同时惊恐地嘶喊，通过无线电传来，破音、失真、带着倒吸冷气的喘息",
    start: at(T.space, 110.6), end: at(T.space, 112.2),
  },
  {
    id: "vc-047", kind: "monologue", speaker: "章北海",
    text: "我知道，这三个人的死，并不能保证飞船的方向就此改变。",
    delivery: "平静、疲惫，像终于放下重物后的低语；语速很慢",
    start: at(T.space, 125.0), end: at(T.space, 130.6),
  },
  {
    id: "vc-048", kind: "monologue", speaker: "章北海",
    text: "但我做了我能做的。",
    delivery: "平静、疲惫的低语，简短，不带任何辩解",
    start: at(T.space, 131.4), end: at(T.space, 133.6),
  },
  {
    id: "vc-049", kind: "monologue", speaker: "章北海",
    text: "不管以后发生什么，在父亲投下的目光里，我可以安心了。",
    delivery: "低沉、温柔而空旷；“父亲”二字带着一丝极轻的颤，最后一句几乎是叹息",
    start: at(T.space, 135.0), end: at(T.space, 140.6),
  },
];
