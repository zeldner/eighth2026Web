// Ilya Zeldner
import React, { useState, useEffect } from "react";
import axios, { AxiosError } from "axios";

const API_BASE = "/api";

interface Order {
  _id: string;
  email: string;
}
interface DropStatus {
  remaining: number;
  soldOut: boolean;
}
interface ErrorResponse {
  message: string;
}

function App() {
  const [email, setEmail] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<DropStatus>({
    remaining: 5,
    soldOut: false,
  });
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const sync = async () => {
      try {
        const [resStatus, resOrders] = await Promise.all([
          axios.get<DropStatus>(`${API_BASE}/status`),
          axios.get<Order[]>(`${API_BASE}/orders`),
        ]);
        setStatus(resStatus.data);
        setOrders(resOrders.data);
      } catch (err) {
        console.error(
          "Vite Proxy Error: Backend unreachable on Port 5000" + err
        );
      }
    };
    sync();
    const timer = setInterval(sync, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const res = await axios.post<{ message: string }>(`${API_BASE}/buy`, {
        email,
      });
      setMessage(res.data.message);
      setEmail("");
    } catch (err) {
      const error = err as AxiosError<ErrorResponse>;
      setMessage(error.response?.data?.message || "Join failed.");
    }
  };

  const handleReset = async () => {
    try {
      await axios.post(`${API_BASE}/reset`);
      setMessage("System Restored");
      setStatus({ remaining: 5, soldOut: false });
      setOrders([]);
    } catch (err) {
      setMessage("Reset failed" + err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-slate-800 rounded-[2.5rem] p-10 border border-slate-700 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500"></div>
        <h1 className="text-3xl font-black text-center mb-6 text-indigo-400 italic">
          EXCLSV DROP
        </h1>

        <div className="bg-slate-900 rounded-3xl p-8 text-center mb-8 border border-slate-700/50">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
            Live Inventory
          </p>
          <div className="text-6xl font-black">
            {status.soldOut ? "SOLD" : status.remaining}
          </div>
        </div>

        {!status.soldOut && (
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              type="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="w-full bg-indigo-600 hover:bg-indigo-500 font-bold py-4 rounded-xl active:scale-95 transition-all">
              Join Waitlist
            </button>
          </form>
        )}

        {message && (
          <div className="mt-6 text-center text-indigo-400 font-bold text-sm animate-pulse">
            {message}
          </div>
        )}

        <div className="mt-10 pt-8 border-t border-slate-700/50">
          <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {orders.length === 0 ? (
              <p className="text-slate-600 italic text-sm text-center">
                Waitlist is currently empty
              </p>
            ) : (
              orders.map((o) => (
                <div
                  key={o._id}
                  className="bg-slate-900/40 p-4 rounded-xl text-xs flex justify-between border border-slate-700/30"
                >
                  <span className="text-slate-300">{o.email}</span>
                  <span className="text-indigo-500 font-black">SECURED</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleReset}
        className="mt-8 text-slate-700 hover:text-slate-500 text-[10px] font-bold uppercase tracking-widest transition-all"
      >
        Reset Database Instance
      </button>
    </div>
  );
}

export default App;
