import { useState, useEffect } from 'react';

const STORAGE_KEY = 'arbnb_user';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setUser(stored ? JSON.parse(stored) : null);
    setLoading(false);
  }, []);

  function signIn(userId, name) {
    const u = { id: userId, name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }

  function signOut() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return { user, loading, signIn, signOut };
}
