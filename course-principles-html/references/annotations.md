# 正文标注

模板内嵌的 assets/annotations.js、annotations.css、annotations-ui.html 负责此功能。生成课程时复用它们，不为每门课重写笔记系统。

## 学生使用

- 鼠标拖选正文静态文字，选择高亮、下划线或评注。键盘选择后可用 Alt+Shift+H / U / N。
- “正文笔记”入口查看原文片段、编辑评注、定位与删除。高亮和下划线也可附评注。
- 笔记保存在当前浏览器，支持 JSON 导出/导入。直接打开 file:// HTML 的存储行为受浏览器和文件路径影响；不能承诺移动文件、换浏览器或清理数据后仍自动保留。导出备份可迁移。
- 原始正文不被改写，公式与动态内容不参与选择标注。跨公式、图形、动态演示或自测区域的选择会提示重新选择；不伪装成可自由涂画的 PDF 工具。
- 存储失败时会提示使用会话笔记并导出。旧浏览器无 CSS Highlights 时保留评注管理，但不声称高亮/下划线已显示。

## 作者与维护

- 根 HTML 的 data-lesson-id 由构建器设置；元信息可明确给稳定的 lesson_id。同课重生成保持相同 ID，并尽可能保留教学段落与章节定位。
- 动态演示加 data-no-annotate；.math、SVG/canvas、控件、自测、脚本/样式自动排除。静态代码文字可以标注。
- 定位采用文字片段、前后文与位置。内容修订或重复片段不能可靠定位时，笔记仍列出但标为未定位，不能猜测放到别处。
- window.courseAnnotations 提供 exportData、importData、getAll、refresh，供自动化验证或维护使用。不会自动把学习记录上传或写入学习者档案。

## 验证

实际浏览器中检查：拖选高亮/下划线、键盘评注、重开恢复、编辑删除、导出/导入、不同课的隔离；跨排除区不破坏公式和演示；内容变化后不错误重挂；窄屏操作不越界；存储失败和功能缺失有明确回退。无浏览器时报告未验证范围。

技术依据：[MDN Selection](https://developer.mozilla.org/en-US/docs/Web/API/Selection)、[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)、[localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)。
