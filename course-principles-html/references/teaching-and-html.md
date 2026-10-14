# 教师讲授稿与 HTML 组件

## 内容决策

先依据材料建立完整课程骨架，再决定哪些地方要补先修、增加解释或突出重点。学生关注某个方法或比较，不改变其他课程知识必须讲解这一点。每节承接上一节已定义的对象，说明新问题，逐步引出概念、公式和求解过程；不要把读者送进尚未解释的控制台。

课程本身的概念、定义与核心步骤仍写清楚，掌握程度较高时可以解释得简洁；外部先修可短回顾或补讲。困惑在对应内容中解决，而不是把全文重排为卡点问答。跨知识点的联系说明具体依赖、逻辑推导、因果机制、相关证据或推广关系。

| 内容 | 专业性要求 |
|---|---|
| 数学/统计 | 对象、符号、假设、推导依据、边界与反例，区分统计量/参数、估计/真实值、相关/因果 |
| 算法/软件 | 输入目标、状态与不变量、步骤、正确性条件、复杂度与失败情形，代码解释关键机制 |
| 硬件/系统 | 数据流/控制流、时序、资源约束、接口条件和性能代价，区分抽象模型与实现 |
| AI/实验 | 模型、优化目标、训练/推断、基线、指标、数据来源及证据边界 |

推导按“当前式 → 使用的定义/定理/条件 → 下一式”说明，再解释结果的意义。首次使用的符号说明对象、范围/单位与作用；例如 c(u,v) 是单步代价，g 是当前路径累计值，h 是估计，h* 是真实最小剩余值，不能只给名字不解释角色。向量、矩阵、索引、时间步、随机量和估计量依各学科的实际需要说明。

算法按“目标与输入输出 → 数据对象与符号 → 课程伪代码 → 控制流解释 → 完整例子 → 正确性/适用条件 → 应用”展开，组织成连贯讲授，不机械套重复栏目。每种算法都要解释初始化、选取规则、循环/递归、终止、更新与返回中实际存在的步骤。提供实现代码可以补充，但不能替代原伪代码及其解释。

课程伪代码先从原页核对，按可读文本转录；保留流程和变量名称，附页码。材料存在错误时展示校订版并简短标明实质修正。材料未提供伪代码，才使用注明“根据课程定义整理”的版本，不虚构出处。核心伪代码保持展开，行组说明明确对应行号或操作；示例的每次关键状态改变都能回到相应伪代码步骤。

例子按“已知输入 → 初始化 → 逐步操作和计算 → 中间结构变化 → 终止检验 → 返回结果”解释。完整运行记录可附在展开区，但主文必须呈现所有决定结果的关键步骤，不能只有最终答案或动画。重复循环可以合并说明，不能把关键更新、失败情况或回溯藏掉。

同一方法的演示放在其定义和伪代码之后；综合比较放在相关方法全部讲解之后，跨全章比较放章末。开篇可展示共同问题与原始数据，不能预置多算法按钮、未定义评价值或综合结果表。

## 讲授表达与重点

- 标题以课程术语、教学对象和内容层级命名，如“搜索问题的形式化表示”“树搜索算法及开放表更新”“A*算法的可容性与一致性”。直观表述必须准确、完整、通顺；避免“走通、揭秘、秘诀”等口号和空泛问句。
- 正文不重述学生画像、产物制作过程或自称“讲透”。单位和假设作为定义的一部分说明；来源的必要校订放短注，不插入与当前概念无关的绘制/实现提醒。
- “定义”标出对象与含义；“关键步骤/结论”标出决定性规则；“成立条件”随结论出现；“易错点”解释具体错因。颜色与文字标签一致，不把所有段落都高亮。
- 比较表先给比较维度，突出决定适用范围的差异。文字解释表中最重要的区别与原因，不能只堆表格，也不能把重要性留给学生猜。
- 核心定义、伪代码、关键公式及决定性推导保持主文可见；补充实现、长证明细节和重复运行记录可折叠。把交互当作讲授的验证与练习，正文不依赖其展开才能理解。

## 构建输入

`lesson-meta.json` 必需字段如下；教学映射是内部记录，不占用正文版面。按课程实际内容增加单元，不规定统一章节数：

```json
{
  "title": "第3章 搜索问题与求解算法",
  "scope": "实际材料名称、页码与教学范围。",
  "sources": [
    {"id": "source-course", "label": "实际课程材料名称", "location": "PDF 物理页码范围", "kind": "course"}
  ],
  "teaching_units": [
    {"id": "representation", "role": "concept", "source": "材料第4—5页", "requires": []},
    {"id": "tree-search", "role": "algorithm", "source": "材料第9页", "requires": ["representation"], "pseudocode": "tree-code", "symbols": ["search-symbols"], "explanation": "tree-explanation", "trace": "tree-example"},
    {"id": "comparison", "role": "comparison", "source": "已讲方法的归纳", "requires": ["tree-search"]}
  ]
}
```

sources 至少一项，ID 唯一。补充来源 kind 为 supplement，href 给实际核查 URL。示例必须替换为真实材料与内容。

teaching_units 包含本次范围内的必讲单元，role 为 concept、algorithm、derivation、application 或 comparison。requires 引用本页前面的单元。每个 algorithm 登记伪代码、首次所需符号说明、行组解释与完整例子的锚点；共同符号表可以复用，但须先于伪代码。comparison 依赖已讲完的相关方法，不能插在开场。构建器检查锚点与顺序，不会判定文字是否专业充分；仍需按原材料人工核查。

可选 lesson_id 用于重生成时保持笔记身份；默认由课程标题与主材料标签生成。learner_note 默认不显示；只有用户要求展示学习侧重点时才设置 show_learner_note=true。不要用它生成学生画像导语。

`lesson-body.html` 只含语义化 HTML 片段。各主章节 `<h2 id="motivation">…</h2>`，目录自动生成。元信息由构建器转义，正文中的原材料文本需转义，保留真正教学标记。

### 公式

```html
<p>当前路径代价为 <span class="math">g(n)</span>。</p>
<div class="math" data-display="block">f(n)=g(n)+h(n)</div>
```

内容为无定界符的 LaTeX，中文解释符号；HTML 中 `<` 和 `&` 需转义。不要把 JSON 转义后的双反斜杠直接写进 HTML。多行可用 `aligned`。模板只渲染 `.math`，不自动处理正文的 `$`。

### 伪代码、符号与重点

```html
<h2 id="tree-search">树搜索算法</h2>
<table id="search-symbols" class="symbol-table"><caption>符号与数据对象</caption>
  <tr><th>符号</th><th>含义及作用</th></tr><tr><td>OPEN</td><td>已生成、等待取出处理的搜索节点集合。</td></tr>
</table>
<figure class="algorithm"><figcaption>算法1　TreeSearch（课程原伪代码，附真实页码）</figcaption>
  <pre id="tree-code" class="pseudocode"><code>1  OPEN ← {起点节点}
2  while OPEN 非空:
3      n ← 按策略从 OPEN 取出
4      if goal_test(n.state): return n.path
5      OPEN ← OPEN ∪ successors(n)
6  return failure</code></pre>
</figure>
<div id="tree-explanation"><p>第1行初始化；第2—3行保证每次只处理一个候选……继续解释所有实质步骤。</p></div>
<div id="tree-example" class="worked-example"><h3>例：按照伪代码构建搜索树</h3><p>给定数据、逐步变化、终止与返回结果。</p></div>
```

这是组件格式示例；算法正文必须来自实际课程核对，不能照搬省略的解释。

```html
<div class="callout concept"><strong>定义</strong><p>对象、含义与使用范围。</p></div>
<div class="callout key"><strong>关键步骤</strong><p>规则及其作用。</p></div>
<div class="callout condition"><strong>成立条件</strong><p>条件及其影响。</p></div>
<div class="callout pitfall"><strong>易错点</strong><p>具体误解、错因与正确解释。</p></div>
<div class="callout extension"><strong>补充</strong><p>必需补充与真实来源。</p></div>
<details class="derivation"><summary>补充推导：具体步骤</summary><p>选读证明细节。</p></details>
```

重点标签按内容选用，不把每段都高亮。宽表包 `.table-wrap`；原理图用内嵌 SVG，箭头说明关系，配标题/描述。

### 自测

```html
<div class="quiz">
  <fieldset><legend>条件变化后会发生什么？</legend>
    <button type="button" data-correct="true" data-feedback="正确。具体依据。">选项 A</button>
    <button type="button" data-correct="false" data-feedback="需要重新考虑某条件，具体错因。">选项 B</button>
  </fieldset>
  <p class="quiz-feedback" aria-live="polite" hidden></p>
</div>
```

开放题可用 details 展示参考推理，不强制选择题。自定义演示的输入要有范围与单位，结果和解释同步变化；事件限定在演示节点，不用 eval。

## 展示检查

模板提供长文宽度、目录、明暗主题与正文标注。主文用连贯段落，避免满屏卡片。课程图片内嵌；动态演示外层加 data-no-annotate，公式/图形由标注层保守排除。标注使用说明见 annotations.md，不需要每次读取其实现。

验收先核对原材料：每项课程知识都讲到、符号先解释、原伪代码展示并解释、关键步骤与例子对应、方法学完才比较、重点可识别。再从头连续读主文，删掉与理解无关的句子。最后检查桌面/窄屏、公式、可见伪代码、目录、主要交互及标注保存恢复；排版和按钮检查不能代替教学验收。

基础交互先初始化，KaTeX 独立排版。联网失败保留原始公式并显示提示；成功加载仍检查 `.math-error`，不能以原始字符串存在代替正常公式排版。

公式资源参考 [KaTeX 官方浏览器说明](https://katex.org/docs/browser.html)。模板固定版本，只有实际兼容问题才查更新。
