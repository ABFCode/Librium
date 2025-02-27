package com.example.springreader.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;


/**
 * This class represents a User entity in our DB
 *
 * The User class implements the UserDetails interface, which is necessary for
 * Spring Security. It has
 * basic user details such as a unique username and password, along with other default implementations
 * for userdetails
 *
 */
@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
public class User implements UserDetails {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String username;

    private String password;

    public User(String username, String password){
        this.username = username;
        this.password = password;
    }

    /**
     * Returns the authorities granted to the user. In practice this method means every user is being assigned a default
     * "USER" role. I'm not using roles anywhere in my app at the moment.
     *
     * @return a collection of GrantedAuthority objects representing the roles or privileges assigned to the user
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("USER"));
    }


    /**
     * Not implemented yet
     */
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
