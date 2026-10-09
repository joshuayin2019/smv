

import {
  Button, Checkbox, Container, Group, Paper, PasswordInput, Text,
  TextInput, Title,BackgroundImage, Overlay, Alert
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState, useEffect } from 'react';
import classes from "./login.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
const url = `${basePath}/api/auth/login`;
import { useGlobalStore } from '@/stores/global_stores';

export default function Login() {
  const { auth, setAuth } = useGlobalStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); 

  const form = useForm({
    initialValues: {
      username: '',
      password: '',
    },
    validate:{
      username: (val) => (val.length < 3 ? 'Username should be at least 3 characters' : null),
      password: (val) => (val.length <= 3 ? 'Password should include at least 4 characters' : null),
    }
  }); 

  const handleSubmit = async() => { 
    const validation = form.validate();
    if (!validation.hasErrors) {
      try {
        setLoading(true);
        const response = await fetch(url,{
          method:'POST',
          body: JSON.stringify({
            data: form.values
          }),
          credentials: 'include',
        });

        const data = await response.json();

        if (!response.ok) {
          //console.log("login failed:", response.status, data); // shows the full object
          throw new Error(
            typeof data?.message === "string" ? data.message : JSON.stringify(data)
          );
        }
        setAuth(data.user);

      } catch(err){
          console.log(err instanceof Error ? err.message : err);
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
      
    } else {
      console.log('Validation Errors:', validation.errors);
    }

  };


  return (
      <BackgroundImage
        src={`${basePath}/727.jpg`} //727.jpg
        className={classes.background}
      >
        <Overlay color="#000" backgroundOpacity={0.75}>
          <Container size={420} my={80}>
            <form method="post" onSubmit={form.onSubmit(handleSubmit)}>
              <Paper withBorder p={22} mt={20} radius="md" className={classes.paper}>
                  <Title ta="center" className={classes.title} mb={10}>
                      Welcome back!
                  </Title>

                  {errorMessage && (
                    <Text c="red" fw={600}>{errorMessage}</Text>
                  )}

      
                  <TextInput
                      label="Username: *" 
                      placeholder="Your username" 
                      radius="md" 
                      className={classes.field}
                      {...form.getInputProps("username")}
                  />

                  <PasswordInput 
                      label="Password: *" 
                      placeholder="Your password" 
                      mt="md" 
                      radius="md" 
                      className={classes.field}
                      styles={{
                          input: {
                          backgroundColor: 'transparent',
                          borderColor: 'aqua',
                          color: 'white',
                          fontStyle: 'normal',
                          },
                      }}
                      {...form.getInputProps("password")}
      
                  />

                <Group justify="space-between" mt="lg">
                  <Checkbox 
                    label="Remember me" 
                    style={{
                      color: 'white'
                    }}
                  />
        
                </Group>
                <Button fullWidth mt="xl" radius="md" c="aqua" type="submit" loading={loading}>
                  <Text c="white">Login</Text>
                </Button>
        
              </Paper>
            </form>
          </Container>
          <Text className={classes.copyright}>
            <a href="http://www.freepik.com">Image Designed <br/>by GarryKillian / Freepik</a>
          </Text>
        </Overlay>
      </BackgroundImage>
  );
}