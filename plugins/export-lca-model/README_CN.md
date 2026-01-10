# LCA 模型快照导出插件

该插件用于导出单个生命周期模型的只读、求解器可用快照。

## 范围

- 只读导出（不修改数据，不做计算）。
- 使用现有天工服务 API 与登录态上下文。
- 导出流水线：
  - LifeCycleModel
  - process instances + links（模型范围）
  - ProcessDataSet（清单）
  - Flow
  - FlowProperty（参考流属性）
  - UnitGroup -> Unit
  - Snapshot JSON

## 修改/新增的文件

### 插件逻辑

- `plugins/export-lca-model/index.ts`
  - 快照导出实现。
  - 名称字段归一化（优先 zh，后备 en）。
  - 输出 `allocation_fraction`（来自 exchange allocations）。
  - links 仅来自 LifeCycleModel connections，支持一个输出连接多个下游。
  - 通过 `getReferenceUnitGroups` 解析 flow -> flow property -> unit group。
  - 仅导出 flows 引用到的 unit group 及其 units。

### UI 触发（仅 LifeCycleModel 页面）

- `src/pages/LifeCycleModels/Components/toolbar/viewIndex.tsx`
  - 纯图标导出按钮 + 提示。
  - 调用 `exportLcaModelSnapshot({ modelId, modelVersion })`。

- `src/pages/LifeCycleModels/Components/toolbar/editIndex.tsx`
  - 编辑页同样的导出按钮。

### i18n 文案

- `src/locales/en-US/pages_model.ts`
- `src/locales/zh-CN/pages_model.ts`

### 测试（mock）

- `tests/unit/pages/LifeCycleModels/Components/toolbar/editIndex.test.tsx`
  - mock `exportLcaModelSnapshot` 和 `ExportOutlined`。

## 备注

- 未新增后端 controller 或 API。
- 未新增认证逻辑。
- links 仅来自 LifeCycleModel connections（不从 inventory 推断）。
