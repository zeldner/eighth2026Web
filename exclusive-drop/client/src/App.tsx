import { useState, useEffect } from "react";

// Define what an "Order" looks like so TypeScript understands
interface Order {
  _id: string;
  email: string;
  createdAt: string;
}

interface Status {
  remaining: number;
  soldOut: boolean;
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [orders, setOrders] = useState<Order[]>([]); // <--- NEW: State to hold the list
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // 1. THE NEW "FETCH" FUNCTION
  // It asks for TWO things: The Count AND The List
  const refreshData = async () => {
    try {
      // A. Get the Status (Count)
      const statusRes = await fetch("http://localhost:5000/api/status");
      const statusData = await statusRes.json();
      setStatus(statusData);

      // B. Get the List (The new part!)
      const ordersRes = await fetch("http://localhost:5000/api/orders");
      const ordersList = await ordersRes.json();
      setOrders(ordersList);
    } catch (error) {
      console.error("Server offline");
    }
  };

  // 2. Auto-Refresh every 2 seconds
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, []);

  // 3. Handle Buying
  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      setMsg(result.message);
      if (result.success) setEmail("");

      // Immediately refresh the list after buying
      refreshData();
    } catch (error) {
      setMsg("Network Error");
    } finally {
      setLoading(false);
    }
  };

  // 4. Reset Button (Optional)
  const handleReset = async () => {
    await fetch("http://localhost:5000/api/reset", { method: "POST" });
    refreshData();
  };

  if (!status)
    return <div className="text-white text-center mt-10">Connecting...</div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        {/* HEADER */}
        <h1 className="text-3xl font-bold text-center mb-6">EXCLUSIVE DROP</h1>

        {/* COUNTER */}
        <div
          className={`p-4 rounded-xl border-2 text-center mb-6 ${
            status.soldOut
              ? "border-red-500 bg-red-900/20"
              : "border-emerald-500 bg-emerald-900/20"
          }`}
        >
          <h2 className="text-2xl font-bold">{status.remaining} LEFT</h2>
        </div>

        {/* FORM */}
        {!status.soldOut && (
          <form onSubmit={handleBuy} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Enter email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="p-3 rounded bg-slate-700 border border-slate-600 outline-none focus:border-indigo-500"
            />
            <button className="bg-indigo-600 p-3 rounded font-bold hover:bg-indigo-500 transition">
              {loading ? "PROCESSING..." : "JOIN LIST"}
            </button>
          </form>
        )}

        {msg && (
          <p className="text-center mt-4 text-indigo-400 font-bold">{msg}</p>
        )}

        {/* --- THE NEW LIST SECTION --- */}
        <div className="mt-10 border-t border-slate-700 pt-6">
          <h3 className="text-slate-400 text-xs uppercase font-bold mb-4">
            Current Waiting List ({orders.length})
          </h3>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {orders.length === 0 ? (
              <p className="text-slate-600 text-sm italic">List is empty...</p>
            ) : (
              orders.map((order) => (
                <div
                  key={order._id}
                  className="flex justify-between p-2 bg-slate-700/50 rounded text-sm"
                >
                  <span className="text-emerald-300">{order.email}</span>
                  <span className="text-slate-500">Confirmed</span>
                </div>
              ))
            )}
          </div>
        </div>
        {/* ----------------------------- */}

        <button
          onClick={handleReset}
          className="mt-6 text-xs text-slate-600 underline w-full text-center"
        >
          Reset System
        </button>
      </div>
    </div>
  );
}

export default App;
