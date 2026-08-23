import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

/**
 * Khung tối thiểu: chứng minh web → vite proxy → api → PGlite thông suốt.
 * Màn hình thật (danh sách, board, command palette) là việc của agent Builder,
 * theo docs/spec/30-ui-and-shortcuts.md.
 */
export function App() {
  const { data, isPending, error } = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });

  if (isPending) return <div className="p-6 text-dim">Đang tải…</div>;
  if (error) return <div className="p-6 text-danger">Lỗi: {error.message}</div>;

  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 border-r border-line p-3">
        <div className="mb-4 text-sm font-semibold">{data.team.name}</div>
        <nav className="space-y-1 text-[13px]">
          {data.states.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-hover">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.name}
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6">
        <h1 className="mb-1 text-base font-semibold">Khung đã dựng xong</h1>
        <p className="text-[13px] text-dim">
          {data.states.length} trạng thái · {data.labels.length} nhãn · {data.users.length} thành viên
        </p>
        <p className="mt-4 max-w-xl text-[13px] text-dim">
          Màn hình thật sẽ do agent Builder dựng theo{" "}
          <code className="rounded bg-hover px-1">docs/spec/30-ui-and-shortcuts.md</code>.
        </p>
      </main>
    </div>
  );
}
