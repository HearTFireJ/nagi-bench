import type { VoiceCue } from "@agentbench/cinematic-player";

/**
 * The complete speech manifest. Nothing here is synthesised: every entry is a line for a later
 * dubbing pass, keyed by `id`, and the on-screen subtitles are driven from this list alone.
 */
export const voiceCues: VoiceCue[] = [
  // ---- prologue: the void
  { id: "v001", kind: "monologue", speaker: "章北海", text: "脚下没有大地，四周只有空间。", delivery: "低沉平静，像自言自语，句尾带一点气声", start: 2.8, end: 6.6 },
  { id: "v002", kind: "monologue", speaker: "章北海", text: "没有从哪里来，也不想到哪里去，只是存在着。", delivery: "缓慢，字与字之间留白", start: 7.2, end: 12.6 },
  { id: "v003", kind: "monologue", speaker: "章北海", text: "父亲的在天之灵，也许就是这样的感觉。", delivery: "更轻，近乎耳语", start: 13.6, end: 18.4 },

  // ---- the alley
  { id: "v004", kind: "narration", speaker: "旁白", text: "人类刚刚走到海边，连造船的船坞，都还没有搭起来。", delivery: "克制冷静的男中音，叙述感，不带感情", start: 25.8, end: 31.4 },
  { id: "v005", kind: "narration", speaker: "旁白", text: "一个月后，章北海将带着第一批特遣队进入太空。", delivery: "平稳，略带压迫", start: 32.4, end: 37.0 },

  // ---- the collector's house
  { id: "v006", kind: "dialogue", speaker: "收藏者", text: "哟，来了！随便看，别客气。", delivery: "热情爽朗，五十来岁的北京口音", start: 38.9, end: 41.7 },
  { id: "v007", kind: "monologue", speaker: "章北海", text: "还有人守着自己的小世界。这让他觉得踏实。", delivery: "内心独白，温和的低声", start: 42.4, end: 47.0 },
  { id: "v008", kind: "dialogue", speaker: "收藏者", text: "您是军人吧？现在的军人不太像军人了，但您，我一眼就看得出。", delivery: "边端茶边说，笃定，略带得意", start: 48.0, end: 53.8 },
  { id: "v009", kind: "dialogue", speaker: "章北海", text: "您也曾经是。", delivery: "简短平静的陈述", start: 54.4, end: 56.2 },
  { id: "v010", kind: "dialogue", speaker: "收藏者", text: "好眼力，总参测绘局的。后来穿越南极，专在雪下面找陨石，就迷上了。", delivery: "怀念地说，语速渐快", start: 56.9, end: 62.9 },
  { id: "v011", kind: "dialogue", speaker: "章北海", text: "说到底，地球就是一块大陨石。这只茶杯是，杯里的水也是。", delivery: "淡淡的笑意，举起茶杯", start: 63.6, end: 69.0 },
  { id: "v012", kind: "dialogue", speaker: "收藏者", text: "呵呵，你这就开始砍价了？可我还是信自己的感觉。", delivery: "被逗乐，笑着摆手", start: 69.6, end: 74.0 },
  { id: "v013", kind: "dialogue", speaker: "收藏者", text: "镇宅之宝，火星来的。这些小圆坑，说不定是微生物的化石。", delivery: "压低声音，郑重其事", start: 75.0, end: 80.2 },
  { id: "v014", kind: "dialogue", speaker: "收藏者", text: "黑格出千倍黄金的价，我都没答应。", delivery: "自豪，带一点炫耀", start: 81.0, end: 84.4 },
  { id: "v015", kind: "dialogue", speaker: "章北海", text: "不必太贵重。比重要大，冲击下不易碎，最好能上车床。", delivery: "直入主题，语气平稳", start: 85.4, end: 90.4 },
  { id: "v016", kind: "dialogue", speaker: "收藏者", text: "那就是铁陨石了。铁镍为主，每立方厘米八克多。", delivery: "行家口吻，一边取一边讲", start: 91.0, end: 95.4 },
  { id: "v017", kind: "dialogue", speaker: "章北海", text: "再大些的，要三块。", delivery: "简短", start: 96.2, end: 98.4 },
  { id: "v018", kind: "dialogue", speaker: "收藏者", text: "每克二十美元，每块六万，三块十八万。这个价，您看……", delivery: "试探地报价，尾音上扬", start: 99.0, end: 104.6 },
  { id: "v019", kind: "dialogue", speaker: "章北海", text: "给个账号，我现在就付。", delivery: "平静，没有任何犹豫", start: 105.0, end: 107.6 },
  { id: "v020", kind: "dialogue", speaker: "收藏者", text: "呵呵……其实，我是准备你还价的。", delivery: "尴尬地笑，挠头", start: 108.4, end: 112.0 },
  { id: "v021", kind: "dialogue", speaker: "章北海", text: "不，就这个价。就算是表示我对要送的人的尊重。", delivery: "语气坚决不容商量，后半句放缓、放低", start: 112.6, end: 117.6 },

  // ---- the workshop
  { id: "v022", kind: "narration", speaker: "旁白", text: "下班之后，研究所的车间里空无一人。", delivery: "低沉，缓", start: 119.4, end: 124.2 },
  { id: "v023", kind: "narration", speaker: "旁白", text: "三块陨石，切成铅笔粗细的圆柱，再切成小段。", delivery: "一丝不苟的口吻，跟着机器的节奏", start: 130.6, end: 135.4 },
  { id: "v024", kind: "narration", speaker: "旁白", text: "三十六段。碎屑一粒不留，连加工用的刀具，也一并带走。", delivery: "平淡，逐字清晰", start: 139.2, end: 144.6 },

  // ---- the basement
  { id: "v025", kind: "narration", speaker: "旁白", text: "剩下的事，在一间没有人知道的地下室里完成。", delivery: "低沉，缓慢", start: 149.4, end: 155.0 },
  { id: "v026", kind: "narration", speaker: "旁白", text: "新式无壳弹，弹头直接粘在发射药上，一拧就下来了。", delivery: "陈述事实，节奏均匀", start: 156.0, end: 161.0 },
  { id: "v027", kind: "narration", speaker: "旁白", text: "胶水原本用来修补太空舱外壳，再剧烈的冷热交替，也不会失效。", delivery: "语速放缓，在“太空舱”处略停", start: 162.0, end: 168.2 },
  { id: "v028", kind: "monologue", speaker: "章北海", text: "四段陨石，全碎了，几乎看不出加工的痕迹。", delivery: "低声，满意而克制", start: 188.4, end: 192.6 },
  { id: "v029", kind: "narration", speaker: "旁白", text: "还剩三十二发。够了。", delivery: "平淡得令人不安", start: 194.0, end: 197.4 },

  // ---- space: the station and the wait
  { id: "v030", kind: "narration", speaker: "旁白", text: "黄河空间站，是太空电梯的平衡配重，可以常驻上千人。", delivery: "冷静的叙述，像在念说明书", start: 199.0, end: 206.2 },
  { id: "v031", kind: "narration", speaker: "旁白", text: "八十公里外，是太空军的一号基地。", delivery: "平稳", start: 206.8, end: 210.8 },
  { id: "v032", kind: "narration", speaker: "旁白", text: "三个月，他等的就是今天——黄河站的高层会议。", delivery: "语气渐沉", start: 211.4, end: 215.6 },
  { id: "v033", kind: "monologue", speaker: "章北海", text: "定位单元留在舱里。监测系统会以为，我一整天都没有离开过房间。", delivery: "低声，条理清楚，像在核对清单", start: 217.4, end: 223.4 },
  { id: "v034", kind: "narration", speaker: "旁白", text: "十公里外，一个早就选定的位置。生命维持系统，只够十二个小时。", delivery: "平稳，带着倒计时般的紧迫", start: 231.4, end: 237.4 },
  { id: "v035", kind: "narration", speaker: "旁白", text: "太空里的合影，要等日落。正午的阳光，会让人睁不开眼。", delivery: "解释性的口吻，略放松", start: 238.6, end: 244.8 },
  { id: "v036", kind: "monologue", speaker: "章北海", text: "太阳，开始接触地球的边缘了。", delivery: "极轻，像在报时", start: 247.6, end: 251.0 },
  { id: "v037", kind: "narration", speaker: "旁白", text: "面罩一个个调成透明。他要找的三个人，都站在最前排正中。", delivery: "冷静得近乎残忍", start: 268.2, end: 274.0 },
  { id: "v038", kind: "narration", speaker: "旁白", text: "三个月里，取枪、装镜、换弹夹，他演练了无数遍。", delivery: "平淡，随着动作的节拍", start: 279.0, end: 284.8 },
  { id: "v039", kind: "monologue", speaker: "章北海", text: "他们也是无辜的。可正是那段如履薄冰的岁月，禁锢了他们。", delivery: "极低，自我辩驳般的平静", start: 288.6, end: 294.4 },
  { id: "v040", kind: "monologue", speaker: "章北海", text: "为了飞向恒星，必须消灭他们。", delivery: "更轻，一字一顿，不带情绪", start: 295.6, end: 298.6 },
  { id: "v041", kind: "scene", speaker: "合影者", text: "陨石雨！", delivery: "隔着面罩的无声口型（真空中无法传声），由章北海从口型读出", start: 309.4, end: 311.0 },
  { id: "v042", kind: "monologue", speaker: "章北海", text: "他们的死，也算是为太空事业做的最后一份贡献。", delivery: "平静，像在念悼词", start: 326.0, end: 331.4 },
  { id: "v043", kind: "monologue", speaker: "章北海", text: "不管以后发生什么，我做了我能做的。", delivery: "低声，疲惫而笃定", start: 334.6, end: 339.2 },
  { id: "v044", kind: "monologue", speaker: "章北海", text: "父亲，我可以安心了。", delivery: "几乎听不见，缓慢，留出长长的尾音", start: 342.0, end: 346.6 },
];
