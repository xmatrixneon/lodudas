'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Code, Copy, Play, CheckCircle, XCircle, Send, Bot } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  template?: string;
  otp?: string;
  error?: string;
}

export default function SmsTemplateGenerator() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your SMS template generator. Send me an SMS message and I\'ll create a template for you. You can also ask me to fix or improve templates!'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testSms, setTestSms] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; otp?: string; error?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/sms-template-generator/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.trim(),
          history: messages.slice(-10) // Send last 10 messages for context
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: data.response || 'Here\'s your template:',
          template: data.template,
          otp: data.extractedOtp
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Auto-fill test SMS if this was a generation request
        if (data.originalSms) {
          setTestSms(data.originalSms);
        }
      } else {
        const errorMessage: Message = {
          role: 'assistant',
          content: data.error || 'Failed to generate template',
          error: data.details
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (err) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Error communicating with the server'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestTemplate = async (template: string) => {
    if (!testSms.trim()) {
      toast.error('Please enter an SMS to test against');
      return;
    }

    setTestResult(null);

    try {
      const response = await fetch('/api/sms-template-generator/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, smsText: testSms.trim() }),
      });

      const data = await response.json();
      setTestResult(data);

      if (data.success) {
        toast.success(`✅ Template works! Extracted OTP: ${data.otp}`);
      } else {
        toast.error(`❌ Template failed: ${data.error}`);
      }
    } catch (err) {
      toast.error('Error testing template');
    }
  };

  const handleCopyTemplate = (template: string) => {
    navigator.clipboard.writeText(template);
    toast.success("Template copied!");
  };

  const exampleMessages = [
    { text: "Generate template for: 668523 is OTP for Mobile number verification of User Renu_1982Mishra -IRCTC", label: "IRCTC SMS" },
    { text: "Create template for: OTP for login in your CYBER LINK account is 9980. Please enter this for verify your idaentity. -CYBER LINK", label: "CYBER LINK SMS" },
    { text: "Generate template for: <#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs.", label: "Airtel SMS" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 md:h-8 md:w-8" />
            AI SMS Template Generator
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Chat with AI to generate and test SMS templates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chat with AI
              </CardTitle>
              <CardDescription>
                Send SMS messages or ask for template improvements
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}>
                      {msg.template ? (
                        <div className="space-y-2">
                          <p className="text-sm">{msg.content}</p>
                          <div className="p-2 bg-background rounded border">
                            <code className="text-sm whitespace-pre-wrap break-words">
                              {msg.template}
                            </code>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyTemplate(msg.template!)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setTestSms(messages.find(m => m.template)?.content?.match(/SMS:\s*"([^"]+)"/)?.[1] || '')}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Test
                            </Button>
                          </div>
                          {msg.otp && (
                            <div className="flex items-center gap-1 text-xs">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              <span>Extracted OTP: {msg.otp}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t p-4 space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Send an SMS or ask for help..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={2}
                    className="resize-none"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    size="icon"
                    className="h-auto"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {exampleMessages.map((ex, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant="ghost"
                      onClick={() => setInput(ex.text)}
                      className="text-xs"
                    >
                      {ex.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                Test Template
              </CardTitle>
              <CardDescription>
                Test if a template works with an SMS
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Test SMS:</label>
                <Textarea
                  placeholder="Enter SMS to test against..."
                  value={testSms}
                  onChange={(e) => setTestSms(e.target.value)}
                  rows={4}
                  className="resize-none text-sm font-mono"
                />
              </div>

              {testResult && (
                <Alert variant={testResult.success ? "default" : "destructive"}>
                  {testResult.success ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        ✅ Template works! Extracted OTP: <strong>{testResult.otp}</strong>
                      </AlertDescription>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        ❌ {testResult.error}
                      </AlertDescription>
                    </>
                  )}
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setMessages([{ role: 'assistant', content: 'Hi! I\'m your SMS template generator. Send me an SMS message and I\'ll create a template for you. You can also ask me to fix or improve templates!' }])}
              >
                Clear Chat
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setInput('Help me understand template placeholders')}
              >
                Explain Placeholders
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
