import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import logoIcon from '@/assets/logo-icon.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const waiterLoginSchema = z.object({
  cpf: z.string().refine((v) => v.replace(/\D/g, '').length === 11, 'CPF deve ter 11 dígitos'),
  pin: z.string().refine((v) => /^\d{4}$/.test(v), 'PIN deve ter 4 dígitos'),
});

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '');
}
function formatCpfInput(d: string) {
  const x = d.padEnd(11, ' ').slice(0, 11).trim();
  if (x.length !== 11) return d;
  return `${x.slice(0,3)}.${x.slice(3,6)}.${x.slice(6,9)}-${x.slice(9,11)}`;
}

const signupSchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa deve ter pelo menos 2 caracteres'),
  cnpj: z.string().optional(),
  fullName: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  confirmPassword: z.string(),
  addressStreet: z.string().min(2, 'Endereço é obrigatório'),
  addressNumber: z.string().min(1, 'Número é obrigatório'),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().min(2, 'Bairro é obrigatório'),
  addressReference: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não conferem',
  path: ['confirmPassword'],
});

export default function Auth() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, signUp, isSuperAdmin, isWaiter } = useAuthContext();
  
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [isWaiterLogin, setIsWaiterLogin] = useState(false);
  const [waiterCpf, setWaiterCpf] = useState('');
  const [waiterPin, setWaiterPin] = useState('');
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form
  const [signupCompanyName, setSignupCompanyName] = useState('');
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupAddressStreet, setSignupAddressStreet] = useState('');
  const [signupAddressNumber, setSignupAddressNumber] = useState('');
  const [signupAddressComplement, setSignupAddressComplement] = useState('');
  const [signupAddressNeighborhood, setSignupAddressNeighborhood] = useState('');
  const [signupAddressReference, setSignupAddressReference] = useState('');
  const [signupCnpj, setSignupCnpj] = useState('');

  useEffect(() => {
    if (user && !authLoading) {
      // Redirect based on role
      if (isSuperAdmin()) {
        navigate('/admin');
      } else if (isWaiter()) {
        navigate('/garcom');
      } else {
        navigate('/');
      }
    }
  }, [user, authLoading, navigate, isSuperAdmin, isWaiter]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (isWaiterLogin) {
      try {
        waiterLoginSchema.parse({ cpf: waiterCpf, pin: waiterPin });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const fieldErrors: Record<string, string> = {};
          error.errors.forEach((err) => {
            if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
          });
          setErrors(fieldErrors);
          return;
        }
      }
      const cpfDigits = onlyDigits(waiterCpf);
      const internalEmail = `wtr.${cpfDigits}@waiter.comandatech.app`;
      const internalPassword = `WTR-${waiterPin}-${cpfDigits}`;
      setIsLoading(true);
      const { error } = await signIn(internalEmail, internalPassword);
      setIsLoading(false);
      if (error) {
        toast.error('CPF ou PIN incorretos');
      }
      return;
    }

    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    // Redirect is handled by useEffect
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast.error('Digite seu e-mail');
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotLoading(false);
    if (error) {
      toast.error('Erro ao enviar e-mail. Tente novamente.');
      return;
    }
    toast.success('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.');
    setForgotPasswordOpen(false);
    setForgotEmail('');
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    
    try {
      signupSchema.parse({
        companyName: signupCompanyName,
        cnpj: signupCnpj,
        fullName: signupFullName,
        email: signupEmail,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
        addressStreet: signupAddressStreet,
        addressNumber: signupAddressNumber,
        addressComplement: signupAddressComplement,
        addressNeighborhood: signupAddressNeighborhood,
        addressReference: signupAddressReference,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupFullName, signupCompanyName, {
      street: signupAddressStreet,
      number: signupAddressNumber,
      complement: signupAddressComplement || undefined,
      neighborhood: signupAddressNeighborhood,
      reference: signupAddressReference || undefined,
      cnpj: signupCnpj || undefined,
    });
    setIsLoading(false);
    // Redirect is handled by useEffect
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center bg-white shadow-lg">
              <img src={logoIcon} alt="ComandaTech" className="w-16 h-16 object-contain" />
            </div>
          </div>
          <CardTitle className="text-2xl text-primary">ComandaTech</CardTitle>
          <CardDescription>Software para Restaurantes</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <div className="flex items-center justify-end gap-2 mt-4">
                <Label htmlFor="waiter-toggle" className="text-sm text-muted-foreground cursor-pointer">
                  Sou garçom
                </Label>
                <Switch
                  id="waiter-toggle"
                  checked={isWaiterLogin}
                  onCheckedChange={(v) => { setIsWaiterLogin(v); setErrors({}); }}
                />
              </div>

              {isWaiterLogin ? (
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="waiter-cpf">CPF</Label>
                    <Input
                      id="waiter-cpf"
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="000.000.000-00"
                      value={waiterCpf}
                      onChange={(e) => setWaiterCpf(formatCpfInput(onlyDigits(e.target.value).slice(0, 11)))}
                      maxLength={14}
                      disabled={isLoading}
                      className="text-lg h-12"
                    />
                    {errors.cpf && <p className="text-sm text-destructive">{errors.cpf}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waiter-pin">PIN (4 dígitos)</Label>
                    <Input
                      id="waiter-pin"
                      inputMode="numeric"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••"
                      value={waiterPin}
                      onChange={(e) => setWaiterPin(onlyDigits(e.target.value).slice(0, 4))}
                      maxLength={4}
                      disabled={isLoading}
                      className="text-2xl h-14 tracking-[0.6em] text-center"
                    />
                    {errors.pin && <p className="text-sm text-destructive">{errors.pin}</p>}
                  </div>
                  <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Entrar
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    Esqueceu seu PIN? Peça ao gerente para resetar.
                  </p>
                </form>
              ) : (
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Entrar
                </Button>
              </form>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-company" className="font-bold">Nome da Empresa</Label>
                  <Input
                    id="signup-company"
                    type="text"
                    placeholder="Nome do seu estabelecimento"
                    value={signupCompanyName}
                    onChange={(e) => setSignupCompanyName(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.companyName && <p className="text-sm text-destructive">{errors.companyName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-cnpj" className="font-bold">CNPJ</Label>
                  <Input
                    id="signup-cnpj"
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={signupCnpj}
                    onChange={(e) => setSignupCnpj(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-address-street" className="font-bold">Endereço (rua, avenida, travessa...) *</Label>
                  <Input
                    id="signup-address-street"
                    type="text"
                    placeholder="Ex: Rua das Flores"
                    value={signupAddressStreet}
                    onChange={(e) => setSignupAddressStreet(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.addressStreet && <p className="text-sm text-destructive">{errors.addressStreet}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="signup-address-number" className="font-bold">Número *</Label>
                    <Input
                      id="signup-address-number"
                      type="text"
                      placeholder="Ex: 123"
                      value={signupAddressNumber}
                      onChange={(e) => setSignupAddressNumber(e.target.value)}
                      disabled={isLoading}
                    />
                    {errors.addressNumber && <p className="text-sm text-destructive">{errors.addressNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-address-complement" className="font-bold">Complemento</Label>
                    <Input
                      id="signup-address-complement"
                      type="text"
                      placeholder="Ex: Sala 2"
                      value={signupAddressComplement}
                      onChange={(e) => setSignupAddressComplement(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-address-neighborhood" className="font-bold">Bairro *</Label>
                  <Input
                    id="signup-address-neighborhood"
                    type="text"
                    placeholder="Ex: Centro"
                    value={signupAddressNeighborhood}
                    onChange={(e) => setSignupAddressNeighborhood(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.addressNeighborhood && <p className="text-sm text-destructive">{errors.addressNeighborhood}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-address-reference" className="font-bold">Ponto de Referência</Label>
                  <Input
                    id="signup-address-reference"
                    type="text"
                    placeholder="Ex: Próximo à praça central"
                    value={signupAddressReference}
                    onChange={(e) => setSignupAddressReference(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="font-bold">Seu Nome Completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signupFullName}
                    onChange={(e) => setSignupFullName(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="font-bold">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="font-bold">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password" className="font-bold">Confirmar Senha</Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    disabled={isLoading}
                  />
                  {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recuperar Senha</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">E-mail cadastrado</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                disabled={forgotLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={forgotLoading}>
              {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar link de recuperação
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
