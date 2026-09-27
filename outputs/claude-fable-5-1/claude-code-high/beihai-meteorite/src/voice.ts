import type { VoiceCue } from "@agentbench/cinematic-player";

/**
 * The complete speech manifest. Every subtitle in the film is rendered from this
 * list by the player controls, in the fixed form 【speaker】text. Each entry can be
 * recorded later by `id`; `delivery` is the direction for the voice actor.
 *
 * Speakers: 章北海 (Zhang Beihai), 收藏者 (the meteorite collector), 旁白 (narrator),
 * 黄河站调度 (station traffic control), 摄影师 (photographer), 与会者 (attendees).
 */
export const voiceCues: VoiceCue[] = [
  // ---------------------------------------------------------------- prologue
  { id: "v01", kind: "monologue", speaker: "章北海", text: "脚下没有大地，四周只有空间。", delivery: "极轻的内心独白，几乎是呼吸的一部分，平静", start: 3.0, end: 8.5 },
  { id: "v02", kind: "monologue", speaker: "章北海", text: "没有从哪里来，也不想到哪里去。只是存在着。", delivery: "内心独白，缓慢，句间留白，带一点满足", start: 9.0, end: 14.5 },

  // ------------------------------------------------------------- act one: study
  { id: "v03", kind: "dialogue", speaker: "收藏者", text: "来了来了，快请进。", delivery: "热情、微微喘气地从工作台后站起，北京口音", start: 33.0, end: 35.5 },
  { id: "v04", kind: "dialogue", speaker: "收藏者", text: "您是军人吧。", delivery: "端茶时随口一问，笃定而友善", start: 40.0, end: 42.5 },
  { id: "v05", kind: "dialogue", speaker: "章北海", text: "您也曾经是。", delivery: "低沉、克制、带一点欣赏，不是反问", start: 43.0, end: 45.2 },
  { id: "v06", kind: "dialogue", speaker: "收藏者", text: "好眼力。我大半辈子都在总参测绘局。", delivery: "笑着承认，带自豪", start: 45.6, end: 49.2 },
  { id: "v07", kind: "dialogue", speaker: "收藏者", text: "十多年前随考察队穿越南极，在雪下面找陨石，从那以后就迷上了。", delivery: "回忆的语气，越说越亮", start: 49.6, end: 55.0 },
  { id: "v08", kind: "dialogue", speaker: "收藏者", text: "它们来自尘世之外。每拿到一块，就像去了一个新的外星世界。", delivery: "近乎虔诚，慢下来", start: 55.3, end: 59.6 },
  { id: "v09", kind: "dialogue", speaker: "章北海", text: "地球本身就是星际物质聚成的。地球，就是一块大陨石。", delivery: "平静地拆解，微笑，有把握", start: 60.2, end: 64.0 },
  { id: "v10", kind: "dialogue", speaker: "章北海", text: "我脚下的石头是陨石，手里的茶杯是陨石……杯子里的水，也是陨石。", delivery: "举杯，语速慢，最后一句轻轻落下", start: 64.3, end: 69.0 },
  { id: "v11", kind: "dialogue", speaker: "收藏者", text: "呵呵，你很精明，已经开始砍价了。", delivery: "被逗乐，笃笃地点着对方", start: 69.4, end: 72.4 },
  { id: "v12", kind: "dialogue", speaker: "收藏者", text: "不过，我还是相信自个儿的感觉。", delivery: "收住笑，温和而固执", start: 72.7, end: 75.4 },
  { id: "v13", kind: "dialogue", speaker: "收藏者", text: "说说看，您要什么样的？", delivery: "转入正题，生意人的轻快", start: 76.0, end: 78.3 },
  { id: "v14", kind: "dialogue", speaker: "章北海", text: "不用贵重的。要比重大，受冲击不易碎，好加工。", delivery: "像念一份技术指标，字字清楚", start: 78.6, end: 82.6 },
  { id: "v15", kind: "dialogue", speaker: "收藏者", text: "明白了，要雕刻。那就是铁陨石。", delivery: "会意，转身取货", start: 82.9, end: 86.0 },
  { id: "v16", kind: "dialogue", speaker: "收藏者", text: "这三块成色都好。每块六万，三块十八万。", delivery: "把三块石头一一放下，报价时稍作铺垫", start: 86.3, end: 89.8 },
  { id: "v17", kind: "dialogue", speaker: "章北海", text: "给个账号吧，我现在就付。", delivery: "掏出手机，毫无停顿", start: 90.4, end: 92.8 },
  { id: "v18", kind: "dialogue", speaker: "收藏者", text: "呵呵……其实，我是准备你还价的。", delivery: "半晌没吱声后，尴尬地笑", start: 94.0, end: 97.0 },
  { id: "v19", kind: "dialogue", speaker: "章北海", text: "不，就这个价。算是我对要送的人的一点尊重。", delivery: "坚决地打断，语气低，最后半句几乎是对自己说", start: 97.3, end: 101.0 },

  // ------------------------------------------------------- act two: machining
  { id: "v20", kind: "narration", speaker: "旁白", text: "研究所的车间已经下班，四周空无一人。", delivery: "冷静、低、纪录片式", start: 102.5, end: 106.8 },
  { id: "v21", kind: "narration", speaker: "旁白", text: "三块陨石被切成三十六段铅笔粗细的圆柱。碎屑被一一收走。", delivery: "平铺直叙，与机床节拍一致", start: 107.5, end: 112.5 },
  { id: "v22", kind: "narration", speaker: "旁白", text: "无壳弹的弹头直接粘在发射药上，取下来很容易。", delivery: "近乎说明书的语气", start: 119.8, end: 124.2 },
  { id: "v23", kind: "narration", speaker: "旁白", text: "胶粘剂原是用来修补太空舱表皮的，经得起太空里剧烈的冷热交替。", delivery: "平静，最后四个字略慢", start: 124.6, end: 129.8 },
  { id: "v24", kind: "narration", speaker: "旁白", text: "四段陨石全部破碎，看不出任何加工的痕迹。", delivery: "低而清楚，像检验报告", start: 143.2, end: 147.2 },
  { id: "v25", kind: "monologue", speaker: "章北海", text: "很好。", delivery: "内心，只有两个字，冷", start: 147.6, end: 149.4 },

  // -------------------------------------------------------- act three: orbit
  { id: "v26", kind: "radio", speaker: "黄河站调度", text: "黄河站呼叫周边各单位：高层会议即将结束，出口区交通请避让。", delivery: "无线电，带压缩和轻微底噪，公事公办", start: 152.0, end: 158.0 },
  { id: "v27", kind: "narration", speaker: "旁白", text: "黄河空间站，同步轨道上最大的人造物。八十公里外，是太空军一号基地。", delivery: "开阔、缓慢，有距离感", start: 158.5, end: 164.0 },
  { id: "v28", kind: "narration", speaker: "旁白", text: "他把航天服上的定位单元留在了自己的舱室里。这次外出，不会留下任何记录。", delivery: "低声，像在描述一件不该被看见的事", start: 165.5, end: 171.5 },
  { id: "v29", kind: "narration", speaker: "旁白", text: "航天服的生命维持系统只能维持十二个小时。", delivery: "干燥的事实", start: 175.0, end: 179.5 },
  { id: "v30", kind: "monologue", speaker: "章北海", text: "在这里，我斩断了与下面那个蓝色世界的联系。", delivery: "内心独白，极静，几乎是呼吸间说出的", start: 186.0, end: 191.0 },
  { id: "v31", kind: "monologue", speaker: "章北海", text: "不依附于任何世界。同地球、太阳和银河系一样，悬浮着。", delivery: "更慢，带一丝不易察觉的喜悦", start: 191.5, end: 197.0 },
  { id: "v32", kind: "monologue", speaker: "章北海", text: "父亲，您在那边，也是这种感觉吗？", delivery: "轻，唯一一次露出柔软", start: 197.5, end: 201.2 },
  { id: "v33", kind: "narration", speaker: "旁白", text: "会议结束了。按惯例，全体与会者要到太空中拍一张合影。", delivery: "平静、客观", start: 202.0, end: 207.5 },
  { id: "v34", kind: "radio", speaker: "摄影师", text: "前排领导居中，后排的请再散开一点。", delivery: "无线电，忙碌、随意，背景有其他人的笑声", start: 214.0, end: 218.0 },
  { id: "v35", kind: "chatter", speaker: "与会者", text: "这日落啊，每次都看不够。", delivery: "无线电闲聊，年长，惬意", start: 219.0, end: 222.6 },
  { id: "v36", kind: "chatter", speaker: "与会者", text: "把面罩调透明，不然拍不着脸。", delivery: "无线电闲聊，轻松，带笑", start: 223.0, end: 226.2 },
  { id: "v37", kind: "narration", speaker: "旁白", text: "零下一百度。他把右手转向正在变弱的阳光，取出手枪和两个弹夹。", delivery: "低、稳、不带评判", start: 228.0, end: 233.6 },
  { id: "v38", kind: "narration", speaker: "旁白", text: "三个月来，他在失重中把这套动作演练了上千遍。", delivery: "更低一层，几乎耳语", start: 234.0, end: 238.6 },
  { id: "v39", kind: "monologue", speaker: "章北海", text: "无辜？我要杀的这三个人，也是无辜的。", delivery: "内心独白，冷静得可怕", start: 241.0, end: 246.0 },
  { id: "v40", kind: "monologue", speaker: "章北海", text: "他们用微薄的投入，如履薄冰地开启了太空时代的黎明。", delivery: "带敬意，语速不变", start: 246.5, end: 251.2 },
  { id: "v41", kind: "monologue", speaker: "章北海", text: "可正是那段经历禁锢了他们。为了能飞出太阳系的飞船，必须消灭他们。", delivery: "最后四个字没有任何加重，像一个结论", start: 251.6, end: 256.4 },
  { id: "v42", kind: "radio", speaker: "摄影师", text: "好，就这样。前排别动。", delivery: "无线电，满意、松弛，毫无察觉", start: 260.6, end: 263.4 },
  { id: "v43", kind: "narration", speaker: "旁白", text: "真空里没有风，没有重力，子弹不会减速。飞完这段距离，需要十秒钟。", delivery: "冷静，最后三个字一字一顿", start: 263.7, end: 268.0 },
  { id: "v44", kind: "monologue", speaker: "章北海", text: "不要动。请不要动。", delivery: "内心，唯一一次近乎祈祷", start: 268.3, end: 270.6 },
  { id: "v45", kind: "radio", speaker: "与会者", text: "陨石雨！陨石雨！", delivery: "无线电惊叫，多人重叠，失真", start: 272.6, end: 274.9 },
  { id: "v46", kind: "radio", speaker: "与会者", text: "快！把他们拖回去！快！", delivery: "无线电，喊到嘶哑，背景有警报", start: 275.1, end: 278.4 },
  { id: "v47", kind: "narration", speaker: "旁白", text: "中弹的有五人，包括那三个目标。", delivery: "极冷的报告", start: 280.0, end: 284.0 },
  { id: "v48", kind: "narration", speaker: "旁白", text: "他知道，这三个人的死并不能保证无工质辐射推进飞船成为主流方向。", delivery: "低、平，带一丝疲惫", start: 292.0, end: 298.0 },
  { id: "v49", kind: "narration", speaker: "旁白", text: "但他做了自己能做的。", delivery: "短，落地", start: 298.5, end: 301.4 },
  { id: "v50", kind: "monologue", speaker: "章北海", text: "父亲，不管以后发生什么……在您的目光中，我可以安心了。", delivery: "内心独白，第一次有一点温度，尾音消失在呼吸里", start: 302.4, end: 307.8 },

  // -------------------------------------------------------------------- coda
  { id: "v51", kind: "dialogue", speaker: "收藏者", text: "好东西啊……每一块，都是一个新世界。", delivery: "独自对着放大镜自语，满足，微笑", start: 312.0, end: 316.4 },
];
