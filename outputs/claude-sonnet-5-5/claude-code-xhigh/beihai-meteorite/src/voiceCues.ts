import type { VoiceCue } from "@agentbench/cinematic-player";

/**
 * The single speech manifest. Nothing in this film is synthesised as a voice:
 * every line below is a *cue for later dubbing*, shown as a subtitle in the form
 * 【speaker】text. Fields are exactly: id, kind, speaker, text, delivery, start, end
 * (seconds on the master timeline). Post-production can dub by `id`.
 *
 * Kinds used: monologue (inner voice, mouth closed), dialogue (in-scene, mouth
 * moves), broadcast (old radio in the collector's house), radio (suit-to-suit
 * chatter that the audience alone can hear), scene (lip-read, no sound in vacuum).
 */
export const voiceCues: VoiceCue[] = [
  // ── 序：轨道 ───────────────────────────────────────────────
  { id: "vc-001", kind: "monologue", speaker: "章北海", text: "太阳落下去的时候，他们会出来合影。", delivery: "低沉、平静，像在核对一份日程；句尾轻收，不带情绪", start: 2.6, end: 6.8 },
  { id: "vc-002", kind: "monologue", speaker: "章北海", text: "只有一次机会。", delivery: "更低，近乎气声，一字一顿", start: 13.4, end: 16.4 },

  // ── 一 · 胡同深处 ─────────────────────────────────────────────
  { id: "vc-003", kind: "broadcast", speaker: "广播", text: "……太空电梯建成，可控核聚变取得突破，世界为之一振。", delivery: "老式收音机音质，新闻播音腔，略带沙沙的电流杂音，语速平稳", start: 28.8, end: 33.8 },
  { id: "vc-004", kind: "dialogue", speaker: "收藏者", text: "门没闩，进来！", delivery: "头也不抬，沉浸在手头的石头里，随口提高音量应一声", start: 34.4, end: 35.9 },
  { id: "vc-005", kind: "broadcast", speaker: "广播", text: "另据报道，航天系统高层工作会议，将于下月在黄河空间站召开。", delivery: "同一台收音机；播音腔平淡，像随口报出的一条小消息", start: 36.6, end: 41.6 },
  { id: "vc-006", kind: "dialogue", speaker: "收藏者", text: "哟，稀客！随便看，随便看！", delivery: "转身起立，热情爽朗，带着笑意", start: 42.0, end: 44.6 },
  { id: "vc-007", kind: "monologue", speaker: "章北海", text: "有自己钟爱的小世界，不管大世界怎么变，都能沉浸其中。", delivery: "低声，语速缓慢，带一点不易察觉的暖意与羡慕", start: 44.9, end: 49.9 },
  { id: "vc-008", kind: "dialogue", speaker: "收藏者", text: "您是军人吧？现在的军人不太像军人，可您，我一眼就看得出来。", delivery: "端茶时笑着说，语气笃定，带一点行家的得意", start: 50.3, end: 55.9 },
  { id: "vc-009", kind: "dialogue", speaker: "章北海", text: "您也曾经是军人。", delivery: "平静的陈述，不是疑问；目光直视对方", start: 56.3, end: 57.9 },
  { id: "vc-010", kind: "dialogue", speaker: "收藏者", text: "好眼力！我大半辈子在总参测绘局。", delivery: "得意又谦虚，爽朗大笑后自报家门", start: 58.3, end: 61.5 },
  { id: "vc-011", kind: "dialogue", speaker: "收藏者", text: "十多年前，我在南极的雪下面找陨石，从此就迷上了。", delivery: "陷入回忆，语速放慢，眼神发亮，像在讲一个老故事", start: 62.0, end: 66.6 },
  { id: "vc-012", kind: "dialogue", speaker: "收藏者", text: "每一块，都像一个外星世界。", delivery: "轻声，像在分享一个只对懂行的人说的秘密", start: 66.9, end: 69.6 },
  { id: "vc-013", kind: "dialogue", speaker: "章北海", text: "地球本身就是一块大陨石。这茶杯是，杯里的水，也是彗星带来的。", delivery: "不动声色的调侃，语气平淡，举杯时尾音微微上扬", start: 70.0, end: 75.6 },
  { id: "vc-014", kind: "dialogue", speaker: "收藏者", text: "呵呵，你精明，这就砍价了！可我还是信自己的感觉。", delivery: "先是大笑，随即摇头，用手指点着对方，亲切又固执", start: 76.0, end: 80.6 },
  { id: "vc-015", kind: "dialogue", speaker: "收藏者", text: "镇宅之宝，火星来的。有人出黄金千倍，我没松口。", delivery: "压低声音，郑重，带着藏不住的自豪", start: 81.2, end: 85.6 },
  { id: "vc-016", kind: "dialogue", speaker: "章北海", text: "我不要贵重的。比重大，不易碎，能上车床加工。", delivery: "干脆利落，像在报技术参数", start: 87.4, end: 91.4 },
  { id: "vc-017", kind: "dialogue", speaker: "收藏者", text: "那就是铁陨石了。三块，每块六万，一共十八万。", delivery: "边说边掂着石头，略带试探地报价", start: 91.8, end: 95.8 },
  { id: "vc-018", kind: "dialogue", speaker: "章北海", text: "给个账号，我现在就付。", delivery: "毫不迟疑，已经掏出手机", start: 96.2, end: 98.2 },
  { id: "vc-019", kind: "dialogue", speaker: "收藏者", text: "呵……其实，我是等你还价的。", delivery: "有些尴尬地笑，挠头", start: 98.6, end: 101.2 },
  { id: "vc-020", kind: "dialogue", speaker: "章北海", text: "不。就这个价，算我对要送的人的尊重。", delivery: "坚决地打断对方；“要送的人”四个字稍重，意味深长", start: 101.6, end: 105.2 },

  // ── 二 · 车间与地下室 ───────────────────────────────────────────
  { id: "vc-021", kind: "monologue", speaker: "章北海", text: "不留一粒碎屑，也不留那把刀。", delivery: "低声自语，冷静，像在念一张清单", start: 130.6, end: 134.2 },
  { id: "vc-022", kind: "monologue", speaker: "章北海", text: "这种胶，是修补太空舱外壳的。冷热交替，也不会失效。", delivery: "自语，逐条核对材料的口吻，没有起伏", start: 149.4, end: 154.2 },
  { id: "vc-023", kind: "monologue", speaker: "章北海", text: "进去的时候是整的，出来，就成了一把石粉。谁也看不出加工的痕迹。", delivery: "耳鸣未退，声音发闷；平静里有一丝满意", start: 164.0, end: 169.8 },
  { id: "vc-024", kind: "monologue", speaker: "章北海", text: "三十二发。够了。", delivery: "极轻，合上箱盖的同时说出", start: 171.0, end: 173.0 },

  // ── 三 · 轨道，日落 ─────────────────────────────────────────────
  { id: "vc-025", kind: "monologue", speaker: "章北海", text: "定位单元留在舱里。这次外出，不会留下任何记录。", delivery: "低沉平稳，放下装置的瞬间开口", start: 176.8, end: 181.6 },
  { id: "vc-026", kind: "monologue", speaker: "章北海", text: "十二个小时的氧气。八十公里外，是一号基地。", delivery: "冷静地盘点，像在读仪表", start: 191.6, end: 195.8 },
  { id: "vc-027", kind: "monologue", speaker: "章北海", text: "在这里，我不依附任何世界。没有从哪里来，也不想到哪里去。", delivery: "近乎安宁，语速放得很慢，带着久违的松弛", start: 196.4, end: 201.8 },
  { id: "vc-028", kind: "monologue", speaker: "章北海", text: "漂浮的建材，废弃的垃圾，往来的人。没人会多看一个悬浮的身影。", delivery: "分析式的低语，语气不带感情", start: 203.6, end: 209.4 },
  { id: "vc-029", kind: "monologue", speaker: "章北海", text: "父亲的在天之灵，大概也是这种感觉。", delivery: "极轻，带一丝柔软；说完停顿", start: 210.0, end: 213.4 },
  { id: "vc-030", kind: "radio", speaker: "摄影师", text: "各位往中间靠一靠，首长们请站前排正中。", delivery: "无线电里的轻松口吻，带电流底噪；像每次合影时那样张罗", start: 233.8, end: 237.6 },
  { id: "vc-031", kind: "radio", speaker: "与会者甲", text: "想不到，这辈子真能站在太空里照相。", delivery: "年长者，感慨，语速慢，带笑", start: 238.0, end: 241.2 },
  { id: "vc-032", kind: "radio", speaker: "与会者乙", text: "当年批一次发射经费，要开三个月的会。", delivery: "半开玩笑的怀旧，笑声混在话里", start: 241.6, end: 245.0 },
  { id: "vc-033", kind: "radio", speaker: "与会者丙", text: "值了！老伙计们，笑一笑。", delivery: "爽朗，带着满足", start: 245.3, end: 247.6 },
  { id: "vc-034", kind: "monologue", speaker: "章北海", text: "无辜？他们也是无辜的。", delivery: "极低，像对自己承认一件事实", start: 248.4, end: 250.6 },
  { id: "vc-035", kind: "monologue", speaker: "章北海", text: "是那段如履薄冰的岁月，禁锢了他们的思想。", delivery: "平静地陈述原因，不带责备", start: 251.0, end: 255.0 },
  { id: "vc-036", kind: "monologue", speaker: "章北海", text: "要得到飞向恒星的飞船，他们就必须消失。", delivery: "冷而清晰，最后四个字压得很轻", start: 255.4, end: 259.2 },
  { id: "vc-037", kind: "monologue", speaker: "章北海", text: "三个月，每天练。取枪，装镜，换弹夹。", delivery: "节奏均匀，像在数拍子", start: 262.0, end: 265.4 },
  { id: "vc-038", kind: "monologue", speaker: "章北海", text: "真空里没有风，也没有阻力。子弹不会减速。一支手枪，就够了。", delivery: "呼吸声里的低语，越说越稳", start: 271.4, end: 276.8 },
  { id: "vc-039", kind: "radio", speaker: "摄影师", text: "好，都别动，等推进器的雾散一散。", delivery: "无线电里，轻松地招呼，完全不知道发生了什么", start: 280.0, end: 283.4 },
  { id: "vc-040", kind: "monologue", speaker: "章北海", text: "十秒。几发故意打偏，只求他们别动。", delivery: "极轻，屏住呼吸的间隙里说出", start: 285.6, end: 288.6 },
  { id: "vc-041", kind: "scene", speaker: "合影者", text: "陨石雨！", delivery: "无声。真空里听不见，只有面罩后惊恐的口型——章北海读出的那个词", start: 293.6, end: 295.6 },
  { id: "vc-042", kind: "monologue", speaker: "章北海", text: "陨石雨。他等的，就是这个词。", delivery: "平静，几乎是满意；不带情绪起伏", start: 296.0, end: 298.8 },
  { id: "vc-043", kind: "monologue", speaker: "章北海", text: "三个人的死，不能保证飞船走向正确的方向。但我做了我能做的。", delivery: "冷得像太空；后半句稍缓，是说给自己听", start: 303.0, end: 308.6 },
  { id: "vc-044", kind: "monologue", speaker: "章北海", text: "不管以后发生什么，在父亲投下的目光里，我可以安心了。", delivery: "极轻，最柔软的一句；说完只剩呼吸", start: 309.4, end: 314.4 },

  // ── 尾声 · 老宅 ───────────────────────────────────────────────
  { id: "vc-045", kind: "broadcast", speaker: "广播", text: "本台消息：今日黄河空间站外合影时遭遇陨石雨，五人受伤，其中三人抢救无效。", delivery: "同一台老收音机，播音腔庄重而克制，稍带电流杂音", start: 321.0, end: 327.8 },
  { id: "vc-046", kind: "dialogue", speaker: "收藏者", text: "陨石……雨？", delivery: "极低，迟疑，像在问自己", start: 329.2, end: 331.4 },
];

/** Is a dialogue cue by this speaker active? (drives mouth movement on the painted face) */
export function isSpeaking(time: number, speaker: string): boolean {
  for (const cue of voiceCues) {
    if (cue.kind === "dialogue" && cue.speaker === speaker && time >= cue.start && time < cue.end) return true;
  }
  return false;
}

export function cueById(id: string): VoiceCue {
  const cue = voiceCues.find((c) => c.id === id);
  if (!cue) throw new Error(`Unknown voice cue ${id}`);
  return cue;
}
