import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const USERS = [
  { id: 'user-1', name: 'User 1' },
  { id: 'user-2', name: 'User 2' },
];

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  function handleLogin(user) {
    signIn(user.id, user.name);
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">ARbnb</h1>
        <p className="text-sm text-gray-500 mb-8">Host Dashboard — select a user to continue</p>

        <div className="space-y-3">
          {USERS.map((u) => (
            <button
              key={u.id}
              onClick={() => handleLogin(u)}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-lg text-sm transition"
            >
              {u.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
